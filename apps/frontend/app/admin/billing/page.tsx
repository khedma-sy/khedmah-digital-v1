'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { billingApi, billingError, billingMoney, type BillingOrder } from '../../../lib/billing-client';
import { ActionButton, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import styles from '../../billing/billing.module.css';

export default function BillingAdminPage(){
  const router=useRouter();
  const [orders,setOrders]=useState<BillingOrder[]>([]),[selected,setSelected]=useState(''),[reference,setReference]=useState(''),[checked,setChecked]=useState(false);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const inFlight=useRef(false),active=useRef(true);
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{const result=await billingApi.pending();if(active.current)setOrders(result.orders);}
    catch(cause){if(active.current){if((cause as {statusCode?:number})?.statusCode===401)router.replace('/auth/login?next=%2Fadmin%2Fbilling');else setError(billingError(cause));}}
    finally{if(active.current)setLoading(false);}
  },[router]);
  useEffect(()=>{active.current=true;void load();return()=>{active.current=false;};},[load]);
  const order=orders.find(o=>o.id===selected);
  async function confirm(){
    if(!order||!checked||reference.trim().length<4||inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');setNotice('');
    try{await billingApi.markPaid(order.id,reference.trim());setOrders(current=>current.filter(o=>o.id!==order.id));setSelected('');setReference('');setChecked(false);setNotice('تم تسجيل السداد وتفعيل الاشتراك ومنح النقاط. حُفظ مرجع السداد والمسؤول في سجل الفوترة.');}
    catch(cause){setError(billingError(cause));}finally{inFlight.current=false;setBusy(false);}
  }
  return <PageShell className={styles.page} label="مراجعة سداد الباقات"><PageHeader title="مراجعة سداد الباقات" description="طابق الطلب مع السداد المستلم، ثم سجّل المرجع. تتطلب هذه الصفحة صلاحية إدارة الفوترة." backHref="/admin"/>
    {error&&<StatusMessage tone="danger">{error}</StatusMessage>}{notice&&<StatusMessage tone="success">{notice}</StatusMessage>}
    <div className="ui-page-actions"><ActionButton variant="secondary" disabled={busy||loading} onClick={()=>void load()}>تحديث الطلبات</ActionButton></div>
    {loading?<SkeletonGrid count={2}/>:error?null:orders.length?<>
      <Surface><h2>طلبات بانتظار المراجعة</h2><p>تُعرض أقدم 200 طلب معلق. حدّث القائمة بعد إنهاء الدفعة.</p>{orders.map(o=><article key={o.id} className={styles.order}><h3>{o.planCode}</h3><p>{billingMoney(o.totalMinor)} · الخصم {billingMoney(o.discountMinor)}</p><p className={styles.reference}>رقم الطلب: <bdi>{o.id}</bdi></p><ActionButton variant="secondary" disabled={busy} onClick={()=>{setSelected(o.id);setReference('');setChecked(false);setNotice('');}}>مراجعة هذا السداد</ActionButton></article>)}</Surface>
      {order&&<Surface as="form" className={styles.form} onSubmit={event=>{event.preventDefault();void confirm();}}><h2>تأكيد السداد المستلم</h2><p className={styles.reference}>الطلب <bdi>{order.id}</bdi> · {billingMoney(order.totalMinor)}</p><label>مرجع السداد أو الإيصال<input value={reference} required minLength={4} maxLength={100} disabled={busy} onChange={e=>setReference(e.target.value)}/></label><label className={styles.check}><input type="checkbox" required checked={checked} disabled={busy} onChange={e=>setChecked(e.target.checked)}/> تحققت من استلام المبلغ كاملًا ومطابقته لهذا الطلب، وأن المرجع لم يُستخدم لسداد طلب آخر.</label><ActionButton type="submit" disabled={busy||!checked||reference.trim().length<4}>{busy?'جارٍ تسجيل السداد…':'تأكيد السداد وتفعيل الاشتراك'}</ActionButton></Surface>}
    </>:<EmptyState title="لا توجد طلبات سداد معلقة" description="ستظهر هنا طلبات الاشتراك التي ينشئها العملاء."/>}
  </PageShell>;
}
