'use client';

import { useEffect, useRef, useState } from 'react';
import { billingApi, billingError, billingMoney, billingStatus, type BillingAccount, type BillingPlan, type BillingQuote } from '../../lib/billing-client';
import { KHEDMAH_WHATSAPP_CONTACT_URL } from '../../lib/official-links';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../components/ui-primitives';
import styles from './billing.module.css';

export default function BillingPage(){
  const [plans,setPlans]=useState<BillingPlan[]>([]),[account,setAccount]=useState<BillingAccount|null>(null);
  const [plan,setPlan]=useState(''),[promo,setPromo]=useState(''),[offer,setOffer]=useState('');
  const [quote,setQuote]=useState<BillingQuote|null>(null),[loading,setLoading]=useState(true),[guest,setGuest]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const inFlight=useRef(false),requestId=useRef(''),generation=useRef(0);
  useEffect(()=>{
    let active=true;
    void Promise.allSettled([billingApi.plans(),billingApi.me(),billingApi.promotion()]).then(([catalog,me,promotion])=>{
      if(!active)return;
      if(catalog.status==='fulfilled'){setPlans(catalog.value.plans);setPlan(catalog.value.plans[0]?.code??'');}else setError('تعذر تحميل الباقات. أعد المحاولة.');
      if(me.status==='fulfilled')setAccount(me.value.billing);
      else if((me.reason as {statusCode?:number})?.statusCode===401)setGuest(true);
      else setError('تعذر تحميل حساب الفوترة. أعد المحاولة.');
      if(promotion.status==='fulfilled'&&promotion.value.promotion?.eligible)setOffer(promotion.value.promotion.messageAr);
      setLoading(false);
    });return()=>{active=false;generation.current++;};
  },[]);
  function change(field:'plan'|'promo',value:string){generation.current++;setQuote(null);requestId.current='';setError('');setNotice('');field==='plan'?setPlan(value):setPromo(value);}
  async function review(){
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setNotice('');const version=++generation.current;
    try{const result=await billingApi.quote(plan,promo.trim());if(version===generation.current){setQuote(result);requestId.current||=crypto.randomUUID();}}
    catch(cause){if(version===generation.current){setQuote(null);setError(billingError(cause));}}
    finally{inFlight.current=false;setBusy(false);}
  }
  async function create(){
    if(!quote||inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
    try{const result=await billingApi.create(plan,promo.trim(),requestId.current,quote.totalMinor);setAccount(current=>current?{...current,orders:[result.order,...current.orders.filter(o=>o.id!==result.order.id)]}:current);setQuote(null);requestId.current='';setNotice(`أُنشئ طلب الاشتراك ${result.order.id}. اتصل بخدمة للحصول على تعليمات السداد. يبقى الطلب معلقًا حتى مراجعته.`);}
    catch(cause){setError(billingError(cause));}finally{inFlight.current=false;setBusy(false);}
  }
  async function cancel(id:string){
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
    try{const result=await billingApi.cancel(id);setAccount(current=>current?{...current,orders:current.orders.map(o=>o.id===id?result.order:o)}:current);setNotice('أُلغي طلب الاشتراك.');}
    catch(cause){setError(billingError(cause));}finally{inFlight.current=false;setBusy(false);}
  }
  return <PageShell className={styles.page} label="الباقات والفوترة"><PageHeader title="الباقات والفوترة" eyebrow="خدمة · حسابك" description="اختر الباقة، طبّق كود الخصم، وراجع سجل السداد والنقاط." backHref="/users/me"/>
    {error&&<StatusMessage tone="danger">{error}</StatusMessage>}{notice&&<StatusMessage tone="success">{notice}</StatusMessage>}
    {loading?<SkeletonGrid count={3}/>:<>
      <Surface><h2>طريقة السداد الحالية</h2><p>طلبات المطاعم تُدفع نقدًا عند التسليم. اشتراكات الباقات تُراجع يدويًا بعد السداد وفق تعليمات خدمة؛ الدفع الإلكتروني بالبطاقة غير متاح حاليًا.</p><p>إنشاء طلب اشتراك أو تطبيق كود خصم لا يخصم مبلغًا ولا يفعّل الاشتراك تلقائيًا.</p><a href={KHEDMAH_WHATSAPP_CONTACT_URL} target="_blank" rel="noopener noreferrer">تعليمات السداد والتواصل مع خدمة</a></Surface>
      {guest&&<StatusMessage><ActionLink href="/auth/login?next=%2Fbilling">سجّل الدخول لاستخدام الخصم ومتابعة السداد</ActionLink></StatusMessage>}
      {account&&<Surface><h2>رصيدك: {account.pointsAvailable.toLocaleString('ar-SY-u-nu-latn')} نقطة</h2><p>النقاط رصيد استخدام للخدمات، وليست مبلغًا نقديًا.</p>{account.subscriptions.filter(s=>s.status==='active'&&Date.parse(s.periodEnd)>Date.now()).map(s=><p key={s.id}>{plans.find(p=>p.code===s.planCode)?.nameAr??s.planCode} · حتى {new Date(s.periodEnd).toLocaleDateString('ar-SY')}</p>)}</Surface>}
      {plans.length?<div className={styles.grid}>{plans.map(p=><Surface as="article" key={p.code}><h2>{p.nameAr}</h2><strong>{billingMoney(p.priceMinor)}</strong><p>{p.pointsGranted.toLocaleString('ar-SY-u-nu-latn')} نقطة · {p.durationMonths===12?'سنة':'شهر'}</p><ul>{p.features.map(f=><li key={f}>{f}</li>)}</ul></Surface>)}</div>:<EmptyState title="الباقات غير متاحة الآن" description="لم تصل باقات منشورة من الخدمة." actions={<ActionButton onClick={()=>window.location.reload()}>إعادة المحاولة</ActionButton>}/>}
      {account&&plans.length>0&&<Surface as="form" className={styles.form} onSubmit={event=>{event.preventDefault();void review();}}><h2>مراجعة الباقة وكود الخصم</h2>{offer&&<p>{offer}</p>}
        <label>الباقة<select value={plan} disabled={busy} onChange={e=>change('plan',e.target.value)}>{plans.map(p=><option key={p.code} value={p.code}>{p.nameAr} — {billingMoney(p.priceMinor)}</option>)}</select></label>
        <label>كود الخصم <span>(اختياري للباقات)</span><input dir="ltr" autoCapitalize="characters" autoComplete="off" maxLength={32} value={promo} disabled={busy} onChange={e=>change('promo',e.target.value)}/></label>
        <ActionButton type="submit" disabled={busy}>{busy?'جارٍ التحقق…':'تطبيق الخصم ومراجعة الإجمالي'}</ActionButton>
        {quote&&<div aria-live="polite"><p>قيمة الباقة: {billingMoney(quote.amountMinor)}</p><p>الخصم: {billingMoney(quote.discountMinor)}</p><strong>الإجمالي: {billingMoney(quote.totalMinor)}</strong><p>سداد يدوي بعد التواصل مع خدمة.</p><ActionButton type="button" disabled={busy} onClick={()=>void create()}>إنشاء طلب الاشتراك بهذا الإجمالي</ActionButton></div>}
      </Surface>}
      {account&&<Surface><h2>سجل طلبات الاشتراك</h2>{account.orders.length?account.orders.map(o=><article key={o.id} className={styles.order}><strong>{plans.find(p=>p.code===o.planCode)?.nameAr??o.planCode}</strong><p>{billingStatus(o.status)} · {billingMoney(o.totalMinor)}</p><p className={styles.reference}>رقم الطلب: <bdi>{o.id}</bdi></p>{o.promoCode&&<p>كود الخصم: <bdi>{o.promoCode}</bdi> · {billingMoney(o.discountMinor)}</p>}{o.externalReference&&<p className={styles.reference}>مرجع السداد: <bdi>{o.externalReference}</bdi></p>}{o.status==='pending'&&<ActionButton variant="secondary" disabled={busy} onClick={()=>void cancel(o.id)}>إلغاء طلب الاشتراك</ActionButton>}</article>):<p>لا توجد طلبات اشتراك بعد.</p>}</Surface>}
    </>}
  </PageShell>;
}
