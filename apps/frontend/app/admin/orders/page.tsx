'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect,useState } from 'react';
import { api,type AdminOrderMonitor } from '../../../lib/api-client';

const statusLabel=(value:string)=>({placed:'جديد',quoted:'تم التسعير',merchant_confirmed:'أكده المطعم',courier_assigned:'أُسند لمندوب',courier_accepted:'قبله المندوب',ready_for_pickup:'جاهز للاستلام',picked_up:'قيد التوصيل',delivered:'مُسلّم',rejected:'مرفوض',cancelled:'ملغى'}[value]??value);
const mobilityStatusLabel=(value:string)=>({requested:'بانتظار القبول',accepted:'قُبلت',en_route:'في الطريق',completed:'مكتملة',rejected:'مرفوضة',cancelled:'ملغاة'}[value]??value);
const jobStatusLabel=(value:string)=>({open:'بانتظار العروض',offer_selected:'تم اختيار العرض',in_progress:'قيد التنفيذ',completion_pending:'بانتظار تأكيد الإنجاز',completed:'مكتملة',cancelled:'ملغاة',disputed:'متنازع عليها'}[value]??value);
const verticalLabel=(value:string)=>({food:'طعام',grocery:'بقالة',pharmacy:'صيدلية'}[value]??value);

export default function AdminOrdersPage(){
  const router=useRouter();
  const[data,setData]=useState<AdminOrderMonitor|null>(null);
  const[error,setError]=useState('');
  const[loading,setLoading]=useState(true);
  const load=()=>{setLoading(true);void api.operationsProduct.orderMonitor().then(result=>{setData(result.orderMonitor);setError('')}).catch(cause=>{const status=cause instanceof Error?(cause as Error&{statusCode?:number}).statusCode:undefined;if(status===401){router.replace('/auth/login?next=%2Fadmin%2Forders');return;}setError(status===403?'هذا الحساب لا يملك صلاحية مراقبة الرحلات والطلبات.':cause instanceof Error?cause.message:'تعذر تحميل الرحلات والطلبات.');}).finally(()=>setLoading(false));};
  useEffect(load,[]);

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

      <section className="operations-panel"><div className="panel-heading"><h2>الطعام والتوصيل</h2><span>{data.summary.stale} متأخرة أكثر من 30 دقيقة · {data.summary.unassigned} دون مندوب</span></div>{data.orders.length===0?<p>لا توجد طلبات مسجلة بعد.</p>:<div className="moderation-list">{data.orders.map(order=><article className="moderation-card" key={order.id}><div><h3>{order.merchantName} · {verticalLabel(order.vertical)}</h3><p>{statusLabel(order.status)}{order.stale?' · متأخر ويحتاج متابعة':''}</p><small><bdi>{order.id}</bdi> · {order.courierName?`المندوب: ${order.courierName}`:'لم يُسند لمندوب'} · {order.eventCount} تحديثات</small></div><span className="status-badge">{order.total?`${order.total.toLocaleString('ar-SY')} ${order.currency}`:'السعر غير مكتمل'}</span></article>)}</div>}</section>

      <section className="operations-panel"><div className="panel-heading"><h2>التكسي والنقل</h2><span>{data.mobility.summary.stale} متوقفة أكثر من 30 دقيقة</span></div>{data.mobility.requests.length===0?<p>لا توجد رحلات تنقل مسجلة بعد.</p>:<div className="moderation-list">{data.mobility.requests.map(request=><article className="moderation-card" key={request.id}><div><h3>{request.serviceType==='taxi'?'مشوار تكسي':'طلب مندوب'} · {request.providerName}</h3><p>{mobilityStatusLabel(request.status)}{request.stale?' · تحتاج متابعة':''}</p><small><bdi>{request.id}</bdi> · {request.eventCount} تحديثات · آخر حركة {new Date(request.updatedAt).toLocaleString('ar-SY')}</small></div><span className="status-badge">{request.stale?'متوقفة':'متابعة'}</span></article>)}</div>}</section>

      <section className="operations-panel"><div className="panel-heading"><h2>الخدمات المهنية</h2><span>{data.professionalJobs.summary.attention} تحتاج تدخلًا</span></div>{data.professionalJobs.requests.length===0?<p>لا توجد طلبات خدمات مهنية مسجلة بعد.</p>:<div className="moderation-list">{data.professionalJobs.requests.map(request=><article className="moderation-card" key={request.id}><div><h3>{request.categoryName}{request.providerName?` · ${request.providerName}`:''}</h3><p>{jobStatusLabel(request.status)}{request.needsAttention?' · تحتاج متابعة بشرية':''}</p><small><bdi>{request.id}</bdi> · {request.offerCount} عروض · {request.eventCount} تحديثات</small></div><span className="status-badge">{request.needsAttention?'تدخل مطلوب':'متابعة'}</span></article>)}</div>}</section>

      <p>آخر تحديث {new Date(data.generatedAt).toLocaleTimeString('ar-SY')} · هذه شاشة مراقبة فقط؛ أي معالجة استثنائية تُسجل كحادثة في مركز التشغيل.</p>
    </>:null}
  </main>;
}
