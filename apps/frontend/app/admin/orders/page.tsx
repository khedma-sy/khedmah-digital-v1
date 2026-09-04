'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect,useState } from 'react';
import { api,type AdminOrderMonitor,type MobilityFarePolicy } from '../../../lib/api-client';

const statusLabel=(value:string)=>({placed:'جديد',quoted:'تم التسعير',merchant_confirmed:'أكده المطعم',courier_assigned:'أُسند لمندوب',courier_accepted:'قبله المندوب',ready_for_pickup:'جاهز للاستلام',picked_up:'قيد التوصيل',delivered:'مُسلّم',rejected:'مرفوض',cancelled:'ملغى'}[value]??value);
const mobilityStatusLabel=(value:string)=>({requested:'بانتظار القبول',accepted:'قُبلت',en_route:'في الطريق',arrived:'وصل السائق',in_progress:'العداد يعمل',completed:'مكتملة',rejected:'مرفوضة',cancelled:'ملغاة'}[value]??value);
const jobStatusLabel=(value:string)=>({open:'بانتظار العروض',offer_selected:'تم اختيار العرض',in_progress:'قيد التنفيذ',completion_pending:'بانتظار تأكيد الإنجاز',completed:'مكتملة',cancelled:'ملغاة',disputed:'متنازع عليها'}[value]??value);
const verticalLabel=(value:string)=>({food:'طعام',grocery:'بقالة',pharmacy:'صيدلية'}[value]??value);

export default function AdminOrdersPage(){
  const router=useRouter();
  const[data,setData]=useState<AdminOrderMonitor|null>(null);
  const[error,setError]=useState('');
  const[loading,setLoading]=useState(true);
  const[policies,setPolicies]=useState<Record<'taxi'|'delivery',MobilityFarePolicy>>();
  const[saving,setSaving]=useState('');
  const load=()=>{setLoading(true);void Promise.all([api.operationsProduct.orderMonitor(),api.mobility.farePolicy('taxi'),api.mobility.farePolicy('delivery')]).then(([result,taxi,delivery])=>{setData(result.orderMonitor);setPolicies({taxi:taxi.policy,delivery:delivery.policy});setError('')}).catch(cause=>{const status=cause instanceof Error?(cause as Error&{statusCode?:number}).statusCode:undefined;if(status===401){router.replace('/auth/login?next=%2Fadmin%2Forders');return;}setError(status===403?'هذا الحساب لا يملك صلاحية مراقبة الرحلات والطلبات.':cause instanceof Error?cause.message:'تعذر تحميل الرحلات والطلبات.');}).finally(()=>setLoading(false));};
  useEffect(load,[]);
  const changePolicy=(serviceType:'taxi'|'delivery',field:keyof MobilityFarePolicy,value:number|boolean)=>setPolicies(current=>current?{...current,[serviceType]:{...current[serviceType],[field]:value}}:current);
  const savePolicy=async(serviceType:'taxi'|'delivery')=>{if(!policies)return;const policy=policies[serviceType];if(policy.enabled&&!confirm('اعتماد هذه التعرفة سيتيح بدء عدادات جديدة. هل راجعت الأرقام؟'))return;setSaving(serviceType);try{const {policy:updated}=await api.mobility.updateFarePolicy({serviceType,enabled:policy.enabled,baseFare:policy.baseFare,perKmFare:policy.perKmFare,perWaitingMinuteFare:policy.perWaitingMinuteFare,minimumFare:policy.minimumFare});setPolicies(current=>current?{...current,[serviceType]:updated}:current);}catch(cause){alert(cause instanceof Error?cause.message:'تعذر حفظ التعرفة.');}finally{setSaving('');}};

  return <main id="foundation-content" className="operations-shell" dir="rtl">
    <header className="operations-header"><div><p className="eyebrow">خدمة · التشغيل اللوجستي</p><h1>مراقبة الرحلات والطلبات</h1><p>مركز واحد للطعام والتوصيل والتنقل والخدمات المهنية، دون هواتف أو عناوين أو إحداثيات أو نص المستخدم.</p></div><button onClick={load} disabled={loading}>تحديث</button></header>
    <nav className="admin-navigation"><Link href="/admin">لوحة الإدارة</Link><Link href="/admin/operations-product">مركز التشغيل</Link></nav>
    {loading?<section className="operations-panel" aria-busy="true">جارٍ تحميل الرحلات والطلبات…</section>:error?<section className="operations-panel"><p className="form-error" role="alert">{error}</p></section>:data?<>
      <section className="operations-summary" aria-label="ملخص كل الرحلات التشغيلية">
        <article><strong>{data.summary.active}</strong><span>طلبات توصيل نشطة</span></article>
        <article><strong>{data.mobility.summary.active}</strong><span>رحلات تنقل نشطة</span></article>
        <article><strong>{data.professionalJobs.summary.active}</strong><span>خدمات مهنية نشطة</span></article>
        <article><strong>{data.summary.stale+data.summary.unassigned+data.mobility.summary.stale+data.professionalJobs.summary.attention}</strong><span>حالات تحتاج متابعة</span></article>
      </section>

      {policies&&<section className="operations-panel"><div className="panel-heading"><div><h2>تعرفة خدمة المعتمدة</h2><p>الحساب مركزي: فتح عداد + مسافة + انتظار، ثم تطبّق المنصة الحد الأدنى. لا يستطيع السائق كتابة السعر.</p></div><span>قرار أدمن مسجّل</span></div><div className="moderation-list">{(['taxi','delivery'] as const).map(serviceType=>{const policy=policies[serviceType];return <article className="moderation-card fare-policy-card" key={serviceType}><div><h3>{serviceType==='taxi'?'خدمة تكسي':'مندوب توصيل'}</h3><p>العملة: ليرة سورية</p><div className="fare-policy-grid"><label>فتح العداد<input type="number" min="0" value={policy.baseFare} onChange={event=>changePolicy(serviceType,'baseFare',Number(event.target.value))}/></label><label>كل كيلومتر<input type="number" min="0" value={policy.perKmFare} onChange={event=>changePolicy(serviceType,'perKmFare',Number(event.target.value))}/></label><label>دقيقة الانتظار<input type="number" min="0" value={policy.perWaitingMinuteFare} onChange={event=>changePolicy(serviceType,'perWaitingMinuteFare',Number(event.target.value))}/></label><label>الحد الأدنى<input type="number" min="0" value={policy.minimumFare} onChange={event=>changePolicy(serviceType,'minimumFare',Number(event.target.value))}/></label></div></div><div className="moderation-actions fare-policy-actions"><label><input type="checkbox" checked={policy.enabled} onChange={event=>changePolicy(serviceType,'enabled',event.target.checked)}/> مفعّلة</label><button disabled={saving===serviceType} onClick={()=>void savePolicy(serviceType)}>{saving===serviceType?'جارٍ الحفظ…':'حفظ واعتماد'}</button></div></article>})}</div></section>}

      <section className="operations-panel"><div className="panel-heading"><h2>الطعام والتوصيل</h2><span>{data.summary.stale} متأخرة أكثر من 30 دقيقة · {data.summary.unassigned} دون مندوب</span></div>{data.orders.length===0?<p>لا توجد طلبات مسجلة بعد.</p>:<div className="moderation-list">{data.orders.map(order=><article className="moderation-card" key={order.id}><div><h3>{order.merchantName} · {verticalLabel(order.vertical)}</h3><p>{statusLabel(order.status)}{order.stale?' · متأخر ويحتاج متابعة':''}</p><small><bdi>{order.id}</bdi> · {order.courierName?`المندوب: ${order.courierName}`:'لم يُسند لمندوب'} · {order.eventCount} تحديثات</small></div><span className="status-badge">{order.total?`${order.total.toLocaleString('ar-SY-u-nu-latn')} ${order.currency}`:'السعر غير مكتمل'}</span></article>)}</div>}</section>

      <section className="operations-panel"><div className="panel-heading"><h2>التكسي والنقل</h2><span>{data.mobility.summary.stale} متوقفة أكثر من 30 دقيقة</span></div>{data.mobility.requests.length===0?<p>لا توجد رحلات تنقل مسجلة بعد.</p>:<div className="moderation-list">{data.mobility.requests.map(request=><article className="moderation-card" key={request.id}><div><h3>{request.serviceType==='taxi'?'مشوار تكسي':'طلب مندوب'} · {request.providerName}</h3><p>{mobilityStatusLabel(request.status)}{request.stale?' · تحتاج متابعة':''}</p><small><bdi>{request.id}</bdi> · {request.eventCount} تحديثات · آخر حركة {new Date(request.updatedAt).toLocaleString('ar-SY-u-nu-latn')}</small></div><span className="status-badge">{request.stale?'متوقفة':'متابعة'}</span></article>)}</div>}</section>

      <section className="operations-panel"><div className="panel-heading"><h2>الخدمات المهنية</h2><span>{data.professionalJobs.summary.attention} تحتاج تدخلًا</span></div>{data.professionalJobs.requests.length===0?<p>لا توجد طلبات خدمات مهنية مسجلة بعد.</p>:<div className="moderation-list">{data.professionalJobs.requests.map(request=><article className="moderation-card" key={request.id}><div><h3>{request.categoryName}{request.providerName?` · ${request.providerName}`:''}</h3><p>{jobStatusLabel(request.status)}{request.needsAttention?' · تحتاج متابعة بشرية':''}</p><small><bdi>{request.id}</bdi> · {request.offerCount} عروض · {request.eventCount} تحديثات</small></div><span className="status-badge">{request.needsAttention?'تدخل مطلوب':'متابعة'}</span></article>)}</div>}</section>

      <p>آخر تحديث {new Date(data.generatedAt).toLocaleTimeString('ar-SY-u-nu-latn')} · هذه شاشة مراقبة فقط؛ أي معالجة استثنائية تُسجل كحادثة في مركز التشغيل.</p>
    </>:null}
  </main>;
}
