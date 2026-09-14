"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type FulfillmentOrder, type ProductListing, type PublicBusinessProfile } from "../../../lib/recovered-service-client";
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
  const [couriers,setCouriers] = useState<PublicBusinessProfile[]>([]);
  const [courierChoice,setCourierChoice] = useState<Record<string,string>>({});
  const [alertsEnabled,setAlertsEnabled] = useState(false);
  const [view,setView] = useState<View>("overview");
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [loading,setLoading] = useState(true);
  const [savingHours,setSavingHours] = useState(false);
  const alertsEnabledRef = useRef(false);
  const loadedOnceRef = useRef(false);
  const knownOrderIdsRef = useRef<Set<string>>(new Set());

  const selectedBusiness = businesses.find(b=>b.id===selected);
  const isRestaurant = !!selectedBusiness && restaurantCategories.has(selectedBusiness.categoryCode);

  useEffect(()=>{
    const enabled = window.localStorage.getItem("khedmah-merchant-order-alerts") === "on";
    alertsEnabledRef.current=enabled; setAlertsEnabled(enabled);
  },[]);

  useEffect(()=>{
    void Promise.all([api.businesses.listMine(), api.businesses.search({categoryCode:"delivery_courier"})])
      .then(([mine,available])=>{
        const list=mine.businesses.filter(b=>orderEligible.has(b.categoryCode));
        setBusinesses(list); setSelected(list[0]?.id ?? ""); setCouriers(available.businesses);
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
    announceNewOrders(next); setOrders(next); setError(""); loadedOnceRef.current=true;
  },[announceNewOrders]);

  const loadOperations = useCallback(async(id:string)=>{
    if(!id) return;
    const [productResult,hoursResult]=await Promise.all([api.products.listMine(),api.businesses.getOpeningHours(id)]);
    setProducts(productResult.products.filter(p=>p.businessProfileId===id));
    const normalized=defaultHours();
    for(const h of hoursResult.hours as OpeningHours[]) normalized[h.dayOfWeek]={dayOfWeek:h.dayOfWeek,openTime:h.openTime.slice(0,5),closeTime:h.closeTime.slice(0,5),isClosed:h.isClosed};
    setHours(normalized);
  },[]);

  useEffect(()=>{
    loadedOnceRef.current=false; knownOrderIdsRef.current=new Set(); if(!selected) return;
    void Promise.all([loadOrders(selected),loadOperations(selected)]).catch(c=>setError(c instanceof Error?c.message:"تعذر تحميل بيانات التشغيل."));
    const interval=window.setInterval(()=>void loadOrders(selected).catch(()=>undefined),8000);
    return ()=>window.clearInterval(interval);
  },[loadOrders,loadOperations,selected]);

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
  async function action(o:FulfillmentOrder,status:FulfillmentOrder["status"]){
    let data:Record<string,unknown>={};
    if(status==="quoted"){const raw=window.prompt("رسوم التوصيل");if(raw===null)return;data={deliveryFee:Number(raw),pharmacyApproved:o.vertical!=="pharmacy"||window.confirm("أؤكد أن الصيدلي راجع الطلب ووافق على صرفه")};}
    if(status==="courier_assigned"){const id=courierChoice[o.id];if(!id){setError("اختر مندوباً معتمداً لهذا الطلب أولاً.");return;}data={courierBusinessId:id};}
    if(status==="rejected"){const reason=window.prompt("سبب الرفض");if(!reason)return;data={reason};}
    try{await api.orders.transition(o.id,status,data);await loadOrders(selected);}catch(c){setError(c instanceof Error?c.message:"تعذر تحديث الطلب.");}
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
      <label><span>النشاط</span><select value={selected} onChange={e=>setSelected(e.target.value)}>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
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

    {view==="orders"&&<section className={styles.orderGrid}>{orders.length?orders.map(o=><Surface as="article" key={o.id} className={styles.orderCard}><div className={styles.orderTop}><strong>{statusLabel[o.status]}</strong><span>{money(orderValue(o),o.currency)}</span></div><h2>طلب نقدي</h2><div className={styles.items}>{o.items.map(i=><p key={i.productListingId}>{i.titleAr} × {i.quantity}</p>)}</div><p className={styles.customer}>{o.customerPhone} · {o.deliveryAddress}</p>{o.vertical==="pharmacy"&&<p>مراجعة الصيدلي: {o.pharmacyReviewStatus}</p>}<div className={styles.actions}>{o.status==="placed"&&<><ActionButton onClick={()=>void action(o,"quoted")}>مراجعة وعرض الإجمالي</ActionButton><ActionButton variant="secondary" onClick={()=>void action(o,"rejected")}>رفض</ActionButton></>}{o.status==="merchant_confirmed"&&<><label>المندوب<select value={courierChoice[o.id]??""} onChange={e=>setCourierChoice(c=>({...c,[o.id]:e.target.value}))}><option value="">اختر المندوب</option>{couriers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><ActionButton onClick={()=>void action(o,"courier_assigned")}>تعيين المندوب</ActionButton></>}{o.status==="courier_accepted"&&<ActionButton onClick={()=>void action(o,"ready_for_pickup")}>الطلب جاهز للاستلام</ActionButton>}</div></Surface>):<EmptyState title="لا توجد طلبات" description="ستظهر هنا طلبات العملاء الحقيقية."/>}</section>}

    {view==="menu"&&<section className={styles.menuGrid}>{products.length?products.map(p=><Surface as="article" key={p.id} className={styles.menuCard}><div><span className={p.availability==="out_of_stock"?styles.offline:styles.online}>{p.availability==="out_of_stock"?"غير متاح":"متاح"}</span><h2>{p.titleAr}</h2><p>{money(p.price,p.currency)}</p></div><ActionButton type="button" variant={p.availability==="out_of_stock"?"primary":"secondary"} onClick={()=>void toggleProduct(p)}>{p.availability==="out_of_stock"?"إعادة التفعيل":"إيقاف مؤقت"}</ActionButton></Surface>):<EmptyState title="القائمة فارغة" description="أضف أصنافاً ثم أرسلها للمراجعة." actions={<ActionLink href="/store/sell">إضافة صنف</ActionLink>}/>}</section>}

    {view==="hours"&&<Surface className={styles.hoursPanel}><div className={styles.sectionHeading}><div><span>التشغيل الأسبوعي</span><h2>ساعات استقبال الطلبات</h2></div><ActionButton type="button" disabled={savingHours} onClick={()=>void saveHours()}>{savingHours?"جاري الحفظ…":"حفظ الساعات"}</ActionButton></div><div className={styles.hoursGrid}>{hours.map((h,index)=><div key={h.dayOfWeek} className={styles.hourRow}><strong>{days[h.dayOfWeek]}</strong><label><input type="checkbox" checked={h.isClosed} onChange={e=>setHours(current=>current.map((item,i)=>i===index?{...item,isClosed:e.target.checked}:item))}/> مغلق</label><label>من<input type="time" value={h.openTime} disabled={h.isClosed} onChange={e=>setHours(current=>current.map((item,i)=>i===index?{...item,openTime:e.target.value}:item))}/></label><label>إلى<input type="time" value={h.closeTime} disabled={h.isClosed} onChange={e=>setHours(current=>current.map((item,i)=>i===index?{...item,closeTime:e.target.value}:item))}/></label></div>)}</div></Surface>}
  </PageShell>;
}
