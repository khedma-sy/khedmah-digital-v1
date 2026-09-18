'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { taxiPricingApi, type TaxiPricingConfig, type TaxiPricingRevision, type TaxiPricingState, type TaxiFareSimulation } from '../../../lib/taxi-pricing-client';
import { billingMoney } from '../../../lib/billing-client';
import { ActionButton, PageHeader, PageShell, StatusMessage, Surface } from '../../components/ui-primitives';
import styles from '../../billing/billing.module.css';

const fields:Array<[keyof TaxiPricingConfig,string,number,number]>=[
  ['openingFareMinor','فتح العداد (قرش)',0,100000000],['perKmMinor','لكل كيلومتر (قرش)',0,100000000],
  ['waitPerMinuteMinor','لكل دقيقة انتظار (قرش)',0,100000000],['bookingFeeMinor','رسم الحجز (قرش)',0,100000000],
  ['minimumFareMinor','الحد الأدنى للأجرة (قرش)',0,100000000],['maxAmountMinor','سقف الأجرة (قرش)',1,100000000],
  ['demandMultiplierBps','معامل الطلب (10000 = السعر الأساسي)',10000,20000],['quoteTtlMs','صلاحية العرض (بالمللي ثانية)',30000,900000]
];
const emptyDraft=()=>Object.fromEntries(fields.map(([key])=>[key,''])) as Record<keyof TaxiPricingConfig,string>;
export default function TaxiPricingPage(){
  const router=useRouter(),inFlight=useRef(false);
  const [zone,setZone]=useState(''),[state,setState]=useState<TaxiPricingState|null>(null),[history,setHistory]=useState<TaxiPricingRevision[]>([]);
  const [draft,setDraft]=useState(emptyDraft),[distance,setDistance]=useState(''),[wait,setWait]=useState('0'),[reason,setReason]=useState('');
  const [simulation,setSimulation]=useState<TaxiFareSimulation|null>(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  function failure(cause:unknown){
    const code=(cause as {statusCode?:number})?.statusCode;
    if(code===401){router.replace('/auth/login?next=%2Fadmin%2Ftaxi-pricing');return;}
    setError(code===403?'لا يملك الحساب صلاحية إدارة تسعير التكسي.':code===409?'تغيرت التسعيرة منذ تحميلها. أعد تحميل المنطقة وراجع التعديل.':code===503?'مخزن تسعير الرحلات غير متاح للتفعيل حاليًا. يمكنك مراجعة السجل والمحاكاة.':'تعذر إتمام العملية. راجع رمز المنطقة والمبالغ وحدود الأجرة ثم أعد المحاولة.');
  }
  async function load(){
    if(inFlight.current||!/^[A-Za-z0-9_-]{1,50}$/.test(zone))return;
    inFlight.current=true;setBusy(true);setError('');setNotice('');setState(null);setHistory([]);setSimulation(null);setConfirmed(false);
    try{const [current,previous]=await Promise.all([taxiPricingApi.current(zone),taxiPricingApi.history(zone)]);setState(current);setHistory(previous.revisions);setDraft(current.revision?Object.fromEntries(fields.map(([key])=>[key,String(current.revision![key])])) as Record<keyof TaxiPricingConfig,string>:emptyDraft());}
    catch(cause){failure(cause);}finally{inFlight.current=false;setBusy(false);}
  }
  function config(){if(fields.some(([key])=>draft[key].trim()===''))throw new Error('Missing amount');return Object.fromEntries(fields.map(([key])=>[key,Number(draft[key])])) as unknown as TaxiPricingConfig;}
  async function simulate(){
    if(inFlight.current||!state)return;inFlight.current=true;setBusy(true);setError('');setSimulation(null);setConfirmed(false);
    try{if(distance.trim()===''||wait.trim()==='')throw new Error('Missing distance');setSimulation(await taxiPricingApi.simulate(config(),Number(distance),Number(wait)));}
    catch(cause){failure(cause);}finally{inFlight.current=false;setBusy(false);}
  }
  async function save(){
    if(inFlight.current||!state||!simulation||!confirmed||reason.trim().length<5)return;
    inFlight.current=true;setBusy(true);setError('');
    try{const result=await taxiPricingApi.save(state.zoneCode,config(),reason.trim(),Math.max(state.activeRevision??0,state.revision?.revision??0));setState({...state,revision:result.pricing,activeRevision:result.pricing.revision,synchronized:true});setHistory(current=>[result.pricing,...current].slice(0,100));setSimulation(null);setConfirmed(false);setReason('');setNotice(`حُفظت التسعيرة بالإصدار ${result.pricing.revision}. حفظ التسعيرة لا يفتح استقبال الرحلات.`);}
    catch(cause){setSimulation(null);setConfirmed(false);failure(cause);}finally{inFlight.current=false;setBusy(false);}
  }
  return <PageShell className={styles.page} label="إدارة تسعيرة التكسي"><PageHeader title="إدارة تسعيرة التكسي" eyebrow="خدمة تكسي · الإدارة" description="راجع تسعيرة المنطقة وسجل الإصدارات، اختبر الأجرة، ثم اعتمد تعديلًا موثقًا." backHref="/admin"/>
    {error&&<StatusMessage tone="danger">{error}</StatusMessage>}{notice&&<StatusMessage tone="success">{notice}</StatusMessage>}
    <Surface as="form" className={styles.form} onSubmit={e=>{e.preventDefault();void load();}}><label>رمز منطقة التشغيل<input dir="ltr" required pattern="[A-Za-z0-9_-]{1,50}" maxLength={50} disabled={busy} value={zone} onChange={e=>{setZone(e.target.value);setState(null);setSimulation(null);setConfirmed(false);}}/></label><ActionButton disabled={busy} type="submit">تحميل التسعيرة والسجل</ActionButton></Surface>
    {state&&<><Surface><h2>حالة التسعيرة</h2><p>المنطقة: <bdi>{state.zoneCode}</bdi> · الإصدار المحفوظ: {state.revision?.revision??'لا يوجد'} · الإصدار التشغيلي: {state.activeRevision??'غير متاح'}</p><p>{state.synchronized?'التسعيرة المحفوظة متزامنة مع محرك الرحلات.':'لا يوجد تزامن مثبت بين السجل ومحرك الرحلات لهذه المنطقة.'}</p><p>100 قرش = ليرة سورية جديدة واحدة. محاكاة الأجرة لا تنشئ حجزًا، وتعديل التسعيرة لا يفعّل الرحلات المعطلة.</p></Surface>
      <Surface as="form" className={styles.form} onSubmit={e=>{e.preventDefault();void simulate();}}><h2>تفاصيل التسعيرة</h2>{fields.map(([key,label,min,max])=><label key={key}>{label}<input type="number" required min={min} max={max} step="1" disabled={busy} value={draft[key]} onChange={e=>{setDraft(current=>({...current,[key]:e.target.value}));setSimulation(null);setConfirmed(false);}}/></label>)}<label>مسافة التجربة (متر)<input type="number" min="0" max="500000" step="1" required disabled={busy} value={distance} onChange={e=>{setDistance(e.target.value);setSimulation(null);setConfirmed(false);}}/></label><label>وقت الانتظار (ثانية)<input type="number" min="0" max="86400" step="1" required disabled={busy} value={wait} onChange={e=>{setWait(e.target.value);setSimulation(null);setConfirmed(false);}}/></label><ActionButton type="submit" disabled={busy}>محاكاة الأجرة دون حفظ</ActionButton></Surface>
      {simulation&&<Surface as="form" className={styles.form} onSubmit={e=>{e.preventDefault();void save();}}><h2>نتيجة المحاكاة</h2><p>فتح العداد بعد معامل الطلب: {billingMoney(simulation.openingAfterDemandMinor)}</p><p>الحجز: {billingMoney(simulation.bookingFeeMinor)} · المسافة: {billingMoney(simulation.distanceMinor)} · الانتظار: {billingMoney(simulation.waitingMinor)}</p><p>استكمال الحد الأدنى: {billingMoney(simulation.minimumAdjustmentMinor)}</p><strong>الإجمالي: {billingMoney(simulation.totalMinor)}</strong><label>سبب تعديل التسعيرة<input required minLength={5} maxLength={300} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/></label><label className={styles.check}><input type="checkbox" required disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> راجعت الأجرة وأوافق على اعتماد هذه التسعيرة للمنطقة المختارة.</label><ActionButton type="submit" disabled={busy||!confirmed||reason.trim().length<5}>اعتماد إصدار جديد للتسعيرة</ActionButton></Surface>}
      <Surface><h2>آخر إصدارات المنطقة</h2>{history.length?history.map(item=><article key={item.id} className={styles.order}><h3>الإصدار {item.revision}</h3><p>{item.reason}</p><p>فتح العداد {billingMoney(item.openingFareMinor)} · لكل كم {billingMoney(item.perKmMinor)}</p><p>{new Date(item.createdAt).toLocaleString('ar-SY')}</p></article>):<p>لا يوجد إصدار محفوظ لهذه المنطقة.</p>}</Surface>
    </>}
  </PageShell>;
}
