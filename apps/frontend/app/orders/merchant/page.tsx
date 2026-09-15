"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type FulfillmentOrder, type ProductListing, type PublicBusinessProfile, type EligibleCourier } from "../../../lib/recovered-service-client";
import type { OpeningHours } from "../../../lib/api-client";
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from "../../components/ui-primitives";
import { playOrderRing, requestOrderNotifications, showOrderNotification } from "../order-alerts";
import styles from "./merchant.module.css";

const orderEligible = new Set(["restaurant","cafe","bakery","sweets","catering","juice_icecream","butcher","grocery","fruits_vegetables","fish_poultry_shop","pharmacy"]);
const restaurantCategories = new Set(["restaurant","cafe","bakery","sweets","catering","juice_icecream"]);
const terminal = new Set<FulfillmentOrder["status"]>(["delivered","rejected","cancelled"]);
const statusLabel: Record<FulfillmentOrder["status"], string> = {
  placed:"طلب جديد", quoted:"بانتظار موافقة الزبون", merchant_confirmed:"أكد الزبون الطلب", courier_assigned:"أُرسل إلى المندوب",
  courier_accepted:"قبله المندوب", ready_for_pickup:"جاهز للاستلام", picked_up:"في الطريق", delivered:"تم التسليم", rejected:"مرفوض", cancelled:"ملغي"
};
const days = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
type View = "overview" | "orders" | "menu" | "hours";
type HoursDraft = { dayOfWeek:number; openTime:string; closeTime:string; isClosed:boolean };
type OrderDialog = { order:FulfillmentOrder; action:"quote"|"reject" };
const defaultHours = (): HoursDraft[] => days.map((_, dayOfWeek) => ({ dayOfWeek, openTime:"09:00", closeTime:"23:00", isClosed:false }));
const money = (value:number, currency:string) => currency === "SYP" ? `${value.toLocaleString("ar-SY")} ل.س` : `${value.toLocaleString("en-US")} ${currency}`;
const orderValue = (order:FulfillmentOrder) => order.total ?? order.subtotal + (order.deliveryFee ?? 0);
const sameDay = (iso:string) => {
  const d = new Date(iso), now = new Date();
  return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate();
};

export default function MerchantOrders() {
  const router = useRouter();
  const [businesses,setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [selected,setSelected] = useState("");
  const [orders,setOrders] = useState<FulfillmentOrder[]>([]);
  const [products,setProducts] = useState<ProductListing[]>([]);
  const [hours,setHours] = useState<HoursDraft[]>(defaultHours);
  const [couriers,setCouriers] = useState<EligibleCourier[]>([]);
  const [courierPage,setCourierPage] = useState(1);
  const [courierTotal,setCourierTotal] = useState(0);
  const [courierLoading,setCourierLoading] = useState(false);
  const [courierError,setCourierError] = useState("");
  const [courierRetry,setCourierRetry] = useState(0);
  const selectedRef = useRef("");
  const [courierChoice,setCourierChoice] = useState<Record<string,string>>({});
  const [alertsEnabled,setAlertsEnabled] = useState(false);
  const [view,setView] = useState<View>("overview");
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [loading,setLoading] = useState(true);
  const [savingHours,setSavingHours] = useState(false);
  const [orderDialog,setOrderDialog] = useState<OrderDialog|null>(null);
  const [deliveryFee,setDeliveryFee] = useState("");
  const [pharmacyApproved,setPharmacyApproved] = useState(false);
  const [rejectionReason,setRejectionReason] = useState("");
  const [orderActionId,setOrderActionId] = useState("");
  const alertsEnabledRef = useRef(false);
  const loadedOnceRef = useRef(false);
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const orderActionInFlight = useRef(false);

  const selectedBusiness = businesses.find(b=>b.id===selected);
  const isRestaurant = !!selectedBusiness && restaurantCategories.has(selectedBusiness.categoryCode);

  useEffect(()=>{
    const enabled = window.localStorage.getItem("khedmah-merchant-order-alerts") === "on";
    alertsEnabledRef.current=enabled; setAlertsEnabled(enabled);
  },[]);

  useEffect(()=>{
    void api.businesses.listMine()
      .then((mine)=>{
        const list=mine.businesses.filter(b=>orderEligible.has(b.categoryCode));
        setBusinesses(list); setSelected(list[0]?.id ?? "");
      })
      .catch(c=>{
        if(c instanceof Error && (c as Error & {statusCode?:number}).statusCode===401) router.replace("/auth/login?next=%2Forders%2Fmerchant");
        else setError("تعذر تحميل مساحة إدارة المنشأة.");
      }).finally(()=>setLoading(false));
  },[router]);

  const announceNewOrders = useCallback((incoming:FulfillmentOrder[])=>{
    const fresh=incoming.filter(o=>o.status==="placed"&&!knownOrderIdsRef.current.has(o.id));
    incoming.forEach(o=>knownOrderIdsRef.current.add(o.id));
    if(!loadedOnceRef.current || !fresh.length || !alertsEnabledRef.current) return;
    playOrderRing();
    showOrderNotification("طلب جديد",fresh.length===1?`${fresh[0].items.length} أصناف بانتظار المراجعة.`:`${fresh.length} طلبات جديدة بانتظار المراجعة.`,`merchant-order-${fresh[0].id}`);
  },[]);

  const loadOrders = useCallback(async(id:string)=>{
    if(!id) return;
    const next=(await api.orders.merchant(id)).orders;
    if(selectedRef.current!==id)return;
    announceNewOrders(next); setOrders(next); loadedOnceRef.current=true;
  },[announceNewOrders]);

  const loadOperations = useCallback(async(id:string)=>{
    if(!id) return;
    const [productResult,hoursResult]=await Promise.all([api.products.listMine(),api.businesses.getOpeningHours(id)]);
    if(selectedRef.current!==id)return;
    setProducts(productResult.products.filter(p=>p.businessProfileId===id));
    const normalized=defaultHours();
    for(const h of hoursResult.hours as OpeningHours[]) normalized[h.dayOfWeek]={dayOfWeek:h.dayOfWeek,openTime:h.openTime.slice(0,5),closeTime:h.closeTime.slice(0,5),isClosed:h.isClosed};
    setHours(normalized);
  },[]);

  useEffect(()=>{
    selectedRef.current=selected;setOrders([]);setProducts([]);setCourierChoice({});setCourierPage(1);setOrderDialog(null);
    loadedOnceRef.current=false; knownOrderIdsRef.current=new Set(); if(!selected) return;
    void Promise.all([loadOrders(selected),loadOperations(selected)]).catch(c=>{if(selectedRef.current===selected)setError(c instanceof Error?c.message:"تعذر تحميل بيانات التشغيل.");});
    const interval=window.setInterval(()=>void loadOrders(selected).catch(()=>undefined),8000);
    return ()=>{selectedRef.current="";window.clearInterval(interval);};
  },[loadOrders,loadOperations,selected]);

  useEffect(()=>{
    let active=true;setCouriers([]);setCourierTotal(0);setCourierError("");
    if(!selected)return;
    setCourierLoading(true);
    void api.orders.eligibleCouriers(selected,courierPage).then(result=>{
      if(active){setCouriers(result.couriers);setCourierTotal(result.total);}
    }).catch(()=>{if(active)setCourierError("تعذر تحميل المندوبين المؤهلين. أعد المحاولة.");})
      .finally(()=>{if(active)setCourierLoading(false);});
    return()=>{active=false;};
  },[selected,courierPage,courierRetry]);

  const metrics=useMemo(()=>{
    const today=orders.filter(o=>sameDay(o.createdAt));
    const delivered=today.filter(o=>o.status==="delivered");
    const gross=delivered.reduce((sum,o)=>sum+orderValue(o),0);
    const avg=delivered.length?Math.round(gross/delivered.length):0;
    const closed=today.filter(o=>terminal.has(o.status));
    const completion=closed.length?Math.round(delivered.length/closed.length*100):0;
    const open=orders.filter(o=>!terminal.has(o.status)).length;
    return {today:today.length,delivered:delivered.length,gross,avg,completion,open};
  },[orders]);

  async function enableAlerts(){alertsEnabledRef.current=true;setAlertsEnabled(true);window.localStorage.setItem("khedmah-merchant-order-alerts","on");playOrderRing();await requestOrderNotifications();}

  async function transition(o:FulfillmentOrder,status:FulfillmentOrder["status"],data:Record<string,unknown>={}){
    if(orderActionInFlight.current)return false;
    orderActionInFlight.current=true;setOrderActionId(o.id);setError("");setNotice("");
    try{await api.orders.transition(o.id,status,data);await loadOrders(selected);return true;}
    catch(c){setError(c instanceof Error?c.message:"تعذر تحديث الطلب.");return false;}
    finally{orderActionInFlight.current=false;setOrderActionId("");}
  }

  function openOrderDialog(o:FulfillmentOrder,action:"quote"|"reject"){
    if(orderActionInFlight.current)return;
    setOrderDialog({order:o,action});setDeliveryFee("");setPharmacyApproved(o.vertical!=="pharmacy");setRejectionReason("");setError("");
  }

  async function saveOrderDialog(){
    if(!orderDialog||orderActionInFlight.current)return;
    const {order,action}=orderDialog;
    if(action==="quote"){
      const fee=Number(deliveryFee);
      if(!Number.isFinite(fee)||fee<0){setError("أدخل رسوم توصيل صالحة غير سالبة.");return;}
      if(order.vertical==="pharmacy"&&!pharmacyApproved){setError("يجب تأكيد مراجعة الصيدلي قبل تسعير طلب الصيدلية.");return;}
      if(await transition(order,"quoted",{deliveryFee:fee,pharmacyApproved})){
        setOrderDialog(null);setNotice("تم إرسال المجموع ورسوم التوصيل للعميل للموافقة.");
      }
      return;
    }
    const reason=rejectionReason.trim();
    if(!reason){setError("اكتب سبب رفض الطلب قبل المتابعة.");return;}
    if(await transition(order,"rejected",{reason})){
      setOrderDialog(null);setNotice("تم رفض الطلب وتسجيل السبب.");
    }
  }

  async function assignCourier(o:FulfillmentOrder){
    const id=courierChoice[o.id];if(!id){setError("اختر مندوباً معتمداً لهذا الطلب أولاً.");return;}
    if(await transition(o,"courier_assigned",{courierBusinessId:id}))setNotice("تم إرسال مهمة التوصيل إلى المندوب المختار.");
  }

  async function toggleProduct(product:ProductListing){
    const next=product.availability==="out_of_stock"?"in_stock":"out_of_stock";
    try{
      const result=await api.products.update(product.id,{availability:next,expectedContentRevision:product.contentRevision});
      setProducts(current=>current.map(item=>item.id===product.id?{...item,...result.product,requiresPrescription:product.requiresPrescription,controlledItem:product.controlledItem}:item));
      setNotice(next==="out_of_stock"?`تم إيقاف ${product.titleAr} مؤقتاً.`:`عاد ${product.titleAr} متاحاً للطلب.`);
    }catch(c){setError(c instanceof Error?c.message:"تعذر تحديث توفر الصنف.");}
  }

  async function saveHours(){
    if(!selected)return; setSavingHours(true); setError("");
    try{const result=await api.businesses.setOpeningHours(selected,hours);setHours(result.hours.map(h=>({dayOfWeek:h.dayOfWeek,openTime:h.openTime.slice(0,5),closeTime:h.closeTime.slice(0,5),isClosed:h.isClosed})));setNotice("تم حفظ ساعات العمل.");}
    catch(c){setError(c instanceof Error?c.message:"تعذر حفظ ساعات العمل.");}finally{setSavingHours(false);}
  }

  if(loading)return <PageShell label="لوحة إدارة المنشأة"><SkeletonGrid count={4}/></PageShell>;
  if(!businesses.length)return <PageShell label="لوحة إدارة المنشأة"><PageHeader eyebrow="خدمة فود" title="لوحة إدارة المطعم" description="إدارة الطلبات والقائمة والتشغيل من مكان واحد." backHref="/restaurants"/><EmptyState title="لا يوجد نشاط مؤهل" description="أنشئ مطعماً أو مقهى أو نشاط أغذية ثم أضف قائمة منشورة." actions={<ActionLink href="/business-profiles/new">إضافة نشاط</ActionLink>}/></PageShell>;

  return <PageShell label="لوحة إدارة المطعم">
    <PageHeader eyebrow="خدمة فود · Restaurant Command Center" title={isRestaurant?"لوحة إدارة المطعم":"لوحة إدارة المنشأة"} description="الطلبات الحية، مؤشرات الأداء، القائمة وساعات التشغيل في شاشة واحدة." backHref="/restaurants" actions={<><ActionLink href="/store/sell">إضافة صنف</ActionLink><ActionLink href={`/restaurants/${encodeURIComponent(selected)}`}>عرض واجهة الزبون</ActionLink></>}/>
    {error&&<StatusMessage tone="danger">{error}</StatusMessage>}{notice&&<StatusMessage tone="success">{notice}</StatusMessage>}
    <Surface className={styles.controlBar}>
      <label><span>النشاط</span><select value={selected} disabled={!!orderActionId||savingHours} onChange={e=>{selectedRef.current=e.target.value;setSelected(e.target.value);}}>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <div className={styles.liveState}><span className={alertsEnabled?styles.dotLive:styles.dotIdle}/><strong>{alertsEnabled?"تنبيهات الطلبات مفعّلة":"تنبيهات الطلبات غير مفعّلة"}</strong></div>
      <ActionButton type="button" variant="secondary" disabled={alertsEnabled} onClick={()=>void enableAlerts()}>{alertsEnabled?"الرنة مفعّلة":"تفعيل الرنة والتنبيهات"}</ActionButton>
    </Surface>

    <nav className={styles.tabs} aria-label="أقسام لوحة المطعم">
      {([['overview','نظرة عامة'],['orders','الطلبات'],['menu','القائمة'],['hours','ساعات العمل']] as const).map(([key,label])=><button key={key} type="button" data-active={view===key} onClick={()=>setView(key)}>{label}</button>)}
    </nav>

    {view==="overview"&&<>
      <section className={styles.kpis} aria-label="مؤشرات المطعم">
        <Surface><span>طلبات اليوم</span><strong>{metrics.today}</strong></Surface>
        <Surface><span>طلبات مفتوحة</span><strong>{metrics.open}</strong></Surface>
        <Surface><span>المبيعات المسلمة اليوم</span><strong>{money(metrics.gross,orders.find(o=>o.status==='delivered')?.currency??'SYP')}</strong></Surface>
        <Surface><span>متوسط قيمة الطلب</span><strong>{money(metrics.avg,orders.find(o=>o.status==='delivered')?.currency??'SYP')}</strong></Surface>
        <Surface><span>نسبة الإكمال اليوم</span><strong>{metrics.completion}%</strong></Surface>
      </section>
      <section className={styles.overviewGrid}>
        <Surface><div className={styles.sectionHeading}><div><span>المطبخ الآن</span><h2>طابور الطلبات الحية</h2></div><button type="button" onClick={()=>setView('orders')}>فتح كل الطلبات</button></div>{orders.filter(o=>!terminal.has(o.status)).slice(0,5).map(o=><div className={styles.queueRow} key={o.id}><div><strong>{statusLabel[o.status]}</strong><span>{o.items.length} أصناف · {money(orderValue(o),o.currency)}</span></div><time>{new Date(o.createdAt).toLocaleTimeString('ar-SY',{hour:'2-digit',minute:'2-digit'})}</time></div>)}{!orders.some(o=>!terminal.has(o.status))&&<p className={styles.muted}>لا توجد طلبات مفتوحة الآن.</p>}</Surface>
        <Surface><div className={styles.sectionHeading}><div><span>صحة القائمة</span><h2>توفر الأصناف</h2></div><button type="button" onClick={()=>setView('menu')}>إدارة القائمة</button></div><div className={styles.health}><strong>{products.filter(p=>p.availability!=="out_of_stock").length}</strong><span>متاح</span><strong>{products.filter(p=>p.availability==="out_of_stock").length}</strong><span>متوقف</span></div><p className={styles.muted}>إيقاف الصنف من هنا يمنع بيعه دون حذف بياناته.</p></Surface>
      </section>
    </>}

    {view==="orders"&&<Surface><h2>مندوبي التوصيل في مدينة المنشأة</h2><p>تعرض القائمة أنشطة التوصيل النشطة والمعتمدة مع الموافقة على أحدث الوثائق الأربع. يعيد الخادم فحص الأهلية عند التعيين والقبول والاستلام.</p>
      {courierLoading?<p role="status">جارٍ تحميل المندوبين…</p>:courierError?<StatusMessage tone="danger">{courierError}</StatusMessage>:<p role="status">{courierTotal?`المندوبون المؤهلون: ${courierTotal} · الصفحة ${courierPage}`:'لا يوجد مندوب مؤهل في هذه المدينة حاليًا. يبقى الطلب مؤكدًا دون تعيين حتى يتوفر مندوب.'}</p>}
      <div className="ui-page-actions"><ActionButton variant="secondary" disabled={courierLoading||!!orderActionId} onClick={()=>setCourierRetry(n=>n+1)}>تحديث المندوبين</ActionButton><ActionButton variant="secondary" disabled={courierLoading||courierPage<=1||!!orderActionId} onClick={()=>{setCourierChoice({});setCourierPage(n=>n-1);}}>السابق</ActionButton><ActionButton variant="secondary" disabled={courierLoading||courierPage*20>=courierTotal||!!orderActionId} onClick={()=>{setCourierChoice({});setCourierPage(n=>n+1);}}>التالي</ActionButton><ActionLink href="/orders/courier" variant="quiet">مساحة المندوب</ActionLink></div>
    </Surface>}
    {view==="orders"&&<section className={styles.orderGrid}>{orders.length?orders.map(o=><Surface as="article" key={o.id} className={styles.orderCard}><div className={styles.orderTop}><strong>{statusLabel[o.status]}</strong><span>{money(orderValue(o),o.currency)}</span></div><h2>طلب نقدي</h2><div className={styles.items}>{o.items.map(i=><p key={i.productListingId}>{i.titleAr} × {i.quantity}</p>)}</div><p className={styles.customer}>{o.customerPhone} · {o.deliveryAddress}</p>{o.vertical==="pharmacy"&&<p>مراجعة الصيدلي: {o.pharmacyReviewStatus}</p>}<div className={styles.actions}>{o.status==="placed"&&<><ActionButton disabled={orderActionId===o.id} onClick={()=>openOrderDialog(o,"quote")}>مراجعة وعرض الإجمالي</ActionButton><ActionButton disabled={orderActionId===o.id} variant="secondary" onClick={()=>openOrderDialog(o,"reject")}>رفض</ActionButton></>}{o.status==="merchant_confirmed"&&<><label>المندوب<select value={courierChoice[o.id]??""} disabled={orderActionId===o.id} onChange={e=>setCourierChoice(c=>({...c,[o.id]:e.target.value}))}><option value="">اختر المندوب</option>{couriers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><ActionButton disabled={!!orderActionId||courierLoading||!couriers.some(c=>c.id===courierChoice[o.id])} onClick={()=>void assignCourier(o)}>تعيين المندوب</ActionButton></>}{o.status==="courier_accepted"&&<ActionButton disabled={orderActionId===o.id} onClick={()=>void transition(o,"ready_for_pickup")}>الطلب جاهز للاستلام</ActionButton>}</div></Surface>):<EmptyState title="لا توجد طلبات" description="ستظهر هنا طلبات العملاء الحقيقية."/>}</section>}

    {view==="menu"&&<section className={styles.menuGrid}>{products.length?products.map(p=><Surface as="article" key={p.id} className={styles.menuCard}><div><span className={p.availability==="out_of_stock"?styles.offline:styles.online}>{p.availability==="out_of_stock"?"غير متاح":"متاح"}</span><h2>{p.titleAr}</h2><p>{money(p.price,p.currency)}</p></div><ActionButton type="button" variant={p.availability==="out_of_stock"?"primary":"secondary"} onClick={()=>void toggleProduct(p)}>{p.availability==="out_of_stock"?"إعادة التفعيل":"إيقاف مؤقت"}</ActionButton></Surface>):<EmptyState title="القائمة فارغة" description="أضف أصنافاً ثم أرسلها للمراجعة." actions={<ActionLink href="/store/sell">إضافة صنف</ActionLink>}/>}</section>}

    {view==="hours"&&<Surface className={styles.hoursPanel}><div className={styles.sectionHeading}><div><span>التشغيل الأسبوعي</span><h2>ساعات استقبال الطلبات</h2></div><ActionButton type="button" disabled={savingHours} onClick={()=>void saveHours()}>{savingHours?"جاري الحفظ…":"حفظ الساعات"}</ActionButton></div><div className={styles.hoursGrid}>{hours.map((h,index)=><div key={h.dayOfWeek} className={styles.hourRow}><strong>{days[h.dayOfWeek]}</strong><label><input type="checkbox" checked={h.isClosed} onChange={e=>setHours(current=>current.map((item,i)=>i===index?{...item,isClosed:e.target.checked}:item))}/> مغلق</label><label>من<input type="time" value={h.openTime} disabled={h.isClosed} onChange={e=>setHours(current=>current.map((item,i)=>i===index?{...item,openTime:e.target.value}:item))}/></label><label>إلى<input type="time" value={h.closeTime} disabled={h.isClosed} onChange={e=>setHours(current=>current.map((item,i)=>i===index?{...item,closeTime:e.target.value}:item))}/></label></div>)}</div></Surface>}

    {orderDialog&&<div className="moderation-dialog-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target&&!orderActionInFlight.current)setOrderDialog(null)}}><section className="moderation-dialog" role="dialog" aria-modal="true" aria-labelledby="merchant-order-dialog-title"><h3 id="merchant-order-dialog-title">{orderDialog.action==="quote"?"مراجعة ورسوم التوصيل":"رفض الطلب"}</h3><p>{orderDialog.action==="quote"?"راجع الأصناف ثم أدخل رسوم التوصيل. لن يثبت الطلب أو يُعيّن المندوب حتى يوافق العميل على الإجمالي.":"سجّل سبب الرفض بوضوح ليظهر في سجل الطلب."}</p>{orderDialog.action==="quote"?<div className={styles.dialogForm}><label>رسوم التوصيل<input type="number" min="0" step="1" inputMode="decimal" value={deliveryFee} onChange={event=>setDeliveryFee(event.target.value)} autoFocus/></label>{orderDialog.order.vertical==="pharmacy"&&<label className={styles.confirmRow}><input type="checkbox" checked={pharmacyApproved} onChange={event=>setPharmacyApproved(event.target.checked)}/> أؤكد أن الصيدلي راجع الطلب ووافق على صرف الأصناف المسموح بها.</label>}</div>:<textarea className="moderation-reason" rows={5} autoFocus maxLength={500} value={rejectionReason} onChange={event=>setRejectionReason(event.target.value)} placeholder="سبب رفض الطلب…"/>}<div className="moderation-actions"><button type="button" disabled={!!orderActionId} onClick={()=>setOrderDialog(null)}>إلغاء</button><button type="button" className={orderDialog.action==="reject"?"moderation-reject":"moderation-approve"} disabled={!!orderActionId||(orderDialog.action==="quote"?deliveryFee.trim()===""||(orderDialog.order.vertical==="pharmacy"&&!pharmacyApproved):!rejectionReason.trim())} onClick={()=>void saveOrderDialog()}>{orderActionId?"جارٍ الحفظ…":orderDialog.action==="quote"?"إرسال الإجمالي للعميل":"تأكيد الرفض"}</button></div></section></div>}
  </PageShell>;
}
