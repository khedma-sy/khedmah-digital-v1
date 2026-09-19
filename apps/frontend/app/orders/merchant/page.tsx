"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type FulfillmentOrder, type ProductListing, type PublicBusinessProfile, type EligibleCourier, type FoodPromotion } from "../../../lib/recovered-service-client";
import { merchantOrderMetrics } from "../../../lib/merchant-order-metrics";
import type { OpeningHours } from "../../../lib/api-client";
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from "../../components/ui-primitives";
import { playOrderRing, requestOrderNotifications, showOrderNotification } from "../order-alerts";
import { OrderTimeline } from "../order-timeline";
import styles from "./merchant.module.css";
import theme from "./merchant-theme.module.css";

const orderEligible = new Set(["restaurant","cafe","bakery","sweets","catering","juice_icecream","butcher","grocery","fruits_vegetables","fish_poultry_shop","pharmacy"]);
const restaurantCategories = new Set(["restaurant","cafe","bakery","sweets","catering","juice_icecream"]);
const terminal = new Set<FulfillmentOrder["status"]>(["delivered","rejected","cancelled"]);
const statusLabel: Record<FulfillmentOrder["status"], string> = {
  placed:"طلب جديد", quoted:"بانتظار موافقة الزبون", merchant_confirmed:"أكد الزبون الطلب", courier_assigned:"أُرسل إلى المندوب",
  courier_accepted:"قبله المندوب", ready_for_pickup:"جاهز للاستلام", picked_up:"في الطريق", delivered:"تم التسليم", rejected:"مرفوض", cancelled:"ملغي"
};
const days = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
type View = "overview" | "orders" | "menu" | "hours" | "promotions";
type HoursDraft = { dayOfWeek:number; openTime:string; closeTime:string; isClosed:boolean };
type OrderDialog = { order:FulfillmentOrder; action:"quote"|"reject"|"recall" };
const defaultHours = (): HoursDraft[] => days.map((_, dayOfWeek) => ({ dayOfWeek, openTime:"09:00", closeTime:"23:00", isClosed:false }));
const money = (value:number, currency:string) => currency === "SYP" ? `${value.toLocaleString("ar-SY")} ل.س` : `${value.toLocaleString("en-US")} ${currency}`;
const orderValue = (order:FulfillmentOrder) => order.total ?? order.subtotal - order.discountAmount + (order.deliveryFee ?? 0);


export default function MerchantOrders() {
  const router = useRouter();
  const [businesses,setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [selected,setSelected] = useState("");
  const [orders,setOrders] = useState<FulfillmentOrder[]>([]);
  const [products,setProducts] = useState<ProductListing[]>([]);
  const [promotions,setPromotions] = useState<FoodPromotion[]>([]);
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
  const [savingPromotion,setSavingPromotion] = useState(false);
  const [promotionActionId,setPromotionActionId] = useState("");
  const [promotionDraft,setPromotionDraft] = useState({code:"",nameAr:"",discountType:"percentage" as "percentage"|"fixed",value:"",currency:"SYP" as "SYP"|"USD",minimumSubtotal:"0",maximumDiscount:"",validFrom:"",validUntil:"",maxRedemptions:"",perUserLimit:"1"});
  const [orderDialog,setOrderDialog] = useState<OrderDialog|null>(null);
  const [deliveryFee,setDeliveryFee] = useState("");
  const [pharmacyApproved,setPharmacyApproved] = useState(false);
  const [rejectionReason,setRejectionReason] = useState("");
  const [orderActionId,setOrderActionId] = useState("");
  const alertsEnabledRef = useRef(false);
  const loadedOnceRef = useRef(false);
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const knownOrderStatusesRef = useRef<Map<string,FulfillmentOrder["status"]>>(new Map());
  const orderRequestSequenceRef = useRef(0);
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
    const request=++orderRequestSequenceRef.current;
    const next=(await api.orders.merchant(id)).orders;
    if(selectedRef.current!==id||request!==orderRequestSequenceRef.current)return;
    const released=next.filter(order=>order.status==="merchant_confirmed"&&["courier_assigned","courier_accepted","ready_for_pickup"].includes(knownOrderStatusesRef.current.get(order.id)??""));
    if(released.length)setCourierChoice(current=>{const updated={...current};for(const order of released)updated[order.id]="";return updated;});
    knownOrderStatusesRef.current=new Map(next.map(order=>[order.id,order.status]));
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

  const loadPromotions = useCallback(async(id:string)=>{
    if(!id)return;
    const result=await api.foodPromotions.list(id);
    if(selectedRef.current===id)setPromotions(result.promotions);
  },[]);

  useEffect(()=>{
    selectedRef.current=selected;orderRequestSequenceRef.current+=1;setOrders([]);setProducts([]);setPromotions([]);setCourierChoice({});setCourierPage(1);setOrderDialog(null);
    loadedOnceRef.current=false; knownOrderIdsRef.current=new Set(); knownOrderStatusesRef.current=new Map(); if(!selected) return;
    void Promise.all([loadOrders(selected),loadOperations(selected),...(isRestaurant?[loadPromotions(selected)]:[])]).catch(c=>{if(selectedRef.current===selected)setError(c instanceof Error?c.message:"تعذر تحميل بيانات التشغيل.");});
    const interval=window.setInterval(()=>void loadOrders(selected).catch(()=>undefined),8000);
    return ()=>{selectedRef.current="";orderRequestSequenceRef.current+=1;window.clearInterval(interval);};
  },[isRestaurant,loadOrders,loadOperations,loadPromotions,selected]);

  useEffect(()=>{if(!isRestaurant&&view==="promotions")setView("overview");},[isRestaurant,view]);

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

  const metrics=useMemo(()=>merchantOrderMetrics(orders),[orders]);

  async function enableAlerts(){alertsEnabledRef.current=true;setAlertsEnabled(true);window.localStorage.setItem("khedmah-merchant-order-alerts","on");playOrderRing();await requestOrderNotifications();}

  async function transition(o:FulfillmentOrder,status:FulfillmentOrder["status"],data:Record<string,unknown>={}){
    if(orderActionInFlight.current)return false;
    orderActionInFlight.current=true;setOrderActionId(o.id);setError("");setNotice("");
    try{await api.orders.transition(o.id,status,data);await loadOrders(selected);return true;}
    catch(c){setError(c instanceof Error?c.message:"تعذر تحديث الطلب.");return false;}
    finally{orderActionInFlight.current=false;setOrderActionId("");}
  }

  function openOrderDialog(o:FulfillmentOrder,action:"quote"|"reject"|"recall"){
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
    if(!reason){setError(action==="recall"?"اكتب سبب سحب المهمة قبل المتابعة.":"اكتب سبب رفض الطلب قبل المتابعة.");return;}
    if(action==="recall"){
      if(!order.courierBusinessId){setError("لم يعد هناك مندوب معين لهذا الطلب. حدّث الصفحة.");return;}
      if(await transition(order,"merchant_confirmed",{reason,expectedCourierBusinessId:order.courierBusinessId})){
        setCourierChoice(current=>({...current,[order.id]:""}));setOrderDialog(null);setNotice("سُحبت المهمة ويمكنك الآن اختيار مندوب آخر.");
      }
      return;
    }
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

  async function createPromotion(){
    if(!selected||!isRestaurant||savingPromotion)return;
    const value=Number(promotionDraft.value);
    const minimumSubtotal=Number(promotionDraft.minimumSubtotal);
    const perUserLimit=Number(promotionDraft.perUserLimit);
    const validFrom=new Date(promotionDraft.validFrom);
    const validUntil=new Date(promotionDraft.validUntil);
    if(!promotionDraft.code.trim()||!promotionDraft.nameAr.trim()||!Number.isFinite(value)||value<=0||!Number.isFinite(minimumSubtotal)||minimumSubtotal<0||!Number.isInteger(perUserLimit)||perUserLimit<1||!Number.isFinite(validFrom.getTime())||!Number.isFinite(validUntil.getTime())){setError("أكمل بيانات الحملة بقيم وتواريخ صالحة.");return;}
    setSavingPromotion(true);setError("");setNotice("");
    try{
      await api.foodPromotions.create({
        businessId:selected,code:promotionDraft.code,nameAr:promotionDraft.nameAr,discountType:promotionDraft.discountType,
        ...(promotionDraft.discountType==="percentage"?{percentageOff:value}:{fixedAmount:value}),currency:promotionDraft.currency,minimumSubtotal,
        ...(promotionDraft.maximumDiscount.trim()?{maximumDiscount:Number(promotionDraft.maximumDiscount)}:{}),validFrom:validFrom.toISOString(),validUntil:validUntil.toISOString(),
        ...(promotionDraft.maxRedemptions.trim()?{maxRedemptions:Number(promotionDraft.maxRedemptions)}:{}),perUserLimit,
      });
      await loadPromotions(selected);
      setPromotionDraft(current=>({...current,code:"",nameAr:"",value:"",maximumDiscount:"",maxRedemptions:""}));
      setNotice("تم إنشاء حملة الخصم للمطعم. أصبحت صالحة ضمن المدة والحدود المحددة.");
    }catch(c){setError(c instanceof Error?c.message:"تعذر إنشاء حملة الخصم.");}
    finally{setSavingPromotion(false);}
  }

  async function setPromotionActive(promotion:FoodPromotion){
    if(promotionActionId)return;
    setPromotionActionId(promotion.id);setError("");setNotice("");
    try{
      const result=await api.foodPromotions.setActive(promotion.id,!promotion.active,promotion.updatedAt);
      setPromotions(current=>current.map(item=>item.id===promotion.id?result.promotion:item));
      setNotice(result.promotion.active?"تم تفعيل حملة الخصم.":"تم إيقاف حملة الخصم. لن تُقبل مطالبات جديدة.");
    }catch(c){setError(c instanceof Error?c.message:"تعذر تحديث حملة الخصم.");await loadPromotions(selected).catch(()=>undefined);}
    finally{setPromotionActionId("");}
  }

  if(loading)return <PageShell className={theme.page} label="لوحة إدارة المنشأة"><SkeletonGrid count={4}/></PageShell>;
  if(!businesses.length)return <PageShell className={theme.page} label="لوحة إدارة المنشأة"><PageHeader eyebrow="خدمة فود" title="لوحة إدارة المطعم" description="إدارة الطلبات والقائمة والتشغيل من مكان واحد." backHref="/restaurants"/><EmptyState title="لا يوجد نشاط مؤهل" description="أنشئ مطعماً أو مقهى أو نشاط أغذية ثم أضف قائمة منشورة." actions={<ActionLink href="/business-profiles/new">إضافة نشاط</ActionLink>}/></PageShell>;

  return <PageShell className={theme.page} label="لوحة إدارة المطعم">
    <PageHeader eyebrow="خدمة فود · Restaurant Command Center" title={isRestaurant?"لوحة إدارة المطعم":"لوحة إدارة المنشأة"} description="الطلبات الحية، مؤشرات الأداء، القائمة وساعات التشغيل في شاشة واحدة." backHref="/restaurants" actions={<><ActionLink href="/store/sell">إضافة صنف</ActionLink><ActionLink href={`/restaurants/${encodeURIComponent(selected)}`}>عرض واجهة الزبون</ActionLink></>}/>
    {error&&<StatusMessage tone="danger">{error}</StatusMessage>}{notice&&<StatusMessage tone="success">{notice}</StatusMessage>}
    <Surface className={styles.controlBar}>
      <label><span>النشاط</span><select value={selected} disabled={!!orderActionId||savingHours} onChange={e=>{selectedRef.current=e.target.value;setSelected(e.target.value);}}>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <div className={styles.liveState}><span className={alertsEnabled?styles.dotLive:styles.dotIdle}/><strong>{alertsEnabled?"تنبيهات الطلبات مفعّلة":"تنبيهات الطلبات غير مفعّلة"}</strong></div>
      <ActionButton type="button" variant="secondary" disabled={alertsEnabled} onClick={()=>void enableAlerts()}>{alertsEnabled?"الرنة مفعّلة":"تفعيل الرنة والتنبيهات"}</ActionButton>
    </Surface>

    <nav className={styles.tabs} aria-label="أقسام لوحة المطعم">
      {([['overview','نظرة عامة'],['orders','الطلبات'],['menu','القائمة'],['hours','ساعات العمل']] as const).map(([key,label])=><button key={key} type="button" data-active={view===key} onClick={()=>setView(key)}>{label}</button>)}
      {isRestaurant&&<button type="button" data-active={view==="promotions"} onClick={()=>setView("promotions")}>أكواد الخصم</button>}
    </nav>

    {view==="overview"&&<>
      <p className={styles.muted}>المؤشرات مبنية على آخر 100 طلب متاح في هذه القائمة، بحسب اليوم على جهازك. تُعرض المبالغ لكل عملة على حدة وتشمل رسوم التوصيل.</p>
      <section className={styles.kpis} aria-label="مؤشرات المطعم">
        <Surface><span>طلبات اليوم</span><strong>{metrics.today}</strong></Surface>
        <Surface><span>طلبات مفتوحة</span><strong>{metrics.open}</strong></Surface>
        <Surface><span>إجمالي الطلبات المسلمة اليوم</span>{metrics.amounts.length?metrics.amounts.map(item=><strong key={item.currency}>{money(item.gross,item.currency)}</strong>):<strong>لا توجد طلبات مسلمة</strong>}</Surface>
        <Surface><span>متوسط قيمة الطلب لكل عملة</span>{metrics.amounts.length?metrics.amounts.map(item=><strong key={item.currency}>{money(item.average,item.currency)}</strong>):<strong>—</strong>}</Surface>
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
    {view==="orders"&&<section className={styles.orderGrid}>{orders.length?orders.map(o=><Surface as="article" key={o.id} className={styles.orderCard}><div className={styles.orderTop}><strong>{statusLabel[o.status]}</strong><span>{money(orderValue(o),o.currency)}</span></div><h2>طلب نقدي</h2><div className={styles.items}>{o.items.map(i=><p key={i.productListingId}>{i.titleAr} × {i.quantity}</p>)}</div>{o.promoCode&&o.discountAmount>0&&<p>خصم المطعم <bdi>{o.promoCode}</bdi>: -{money(o.discountAmount,o.currency)} · بعد الخصم {money(o.subtotal-o.discountAmount,o.currency)}</p>}<p className={styles.customer}>{o.customerPhone} · {o.deliveryAddress}</p>{o.courierName&&<p className={styles.customer}>المندوب: <strong>{o.courierName}</strong>{o.courierPhone&&<> · <a href={`tel:${o.courierPhone}`} dir="ltr">{o.courierPhone}</a></>}</p>}{o.rejectionReason&&<StatusMessage tone="danger">سبب الرفض: {o.rejectionReason}</StatusMessage>}{o.vertical==="pharmacy"&&<p>مراجعة الصيدلي: {o.pharmacyReviewStatus}</p>}<OrderTimeline events={o.events}/><div className={styles.actions}>{o.status==="placed"&&<><ActionButton disabled={orderActionId===o.id} onClick={()=>openOrderDialog(o,"quote")}>مراجعة وعرض الإجمالي</ActionButton><ActionButton disabled={orderActionId===o.id} variant="secondary" onClick={()=>openOrderDialog(o,"reject")}>رفض</ActionButton></>}{o.status==="merchant_confirmed"&&<><label>المندوب<select value={courierChoice[o.id]??""} disabled={orderActionId===o.id} onChange={e=>setCourierChoice(c=>({...c,[o.id]:e.target.value}))}><option value="">اختر المندوب المتاح</option>{couriers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><ActionButton disabled={!!orderActionId||courierLoading||!couriers.some(c=>c.id===courierChoice[o.id])} onClick={()=>void assignCourier(o)}>تعيين المندوب</ActionButton><ActionButton disabled={orderActionId===o.id} variant="secondary" onClick={()=>openOrderDialog(o,"reject")}>رفض الطلب</ActionButton></>}{["courier_assigned","courier_accepted","ready_for_pickup"].includes(o.status)&&<ActionButton disabled={orderActionId===o.id} variant="secondary" onClick={()=>openOrderDialog(o,"recall")}>سحب المهمة وتغيير المندوب</ActionButton>}{o.status==="courier_accepted"&&<ActionButton disabled={orderActionId===o.id} onClick={()=>void transition(o,"ready_for_pickup")}>الطلب جاهز للاستلام</ActionButton>}</div></Surface>):<EmptyState title="لا توجد طلبات" description="ستظهر هنا طلبات العملاء الحقيقية."/>}</section>}

    {view==="menu"&&<section className={styles.menuGrid}>{products.length?products.map(p=><Surface as="article" key={p.id} className={styles.menuCard}><div><span className={p.availability==="out_of_stock"?styles.offline:styles.online}>{p.availability==="out_of_stock"?"غير متاح":"متاح"}</span><h2>{p.titleAr}</h2><p>{money(p.price,p.currency)}</p></div><ActionButton type="button" variant={p.availability==="out_of_stock"?"primary":"secondary"} onClick={()=>void toggleProduct(p)}>{p.availability==="out_of_stock"?"إعادة التفعيل":"إيقاف مؤقت"}</ActionButton></Surface>):<EmptyState title="القائمة فارغة" description="أضف أصنافاً ثم أرسلها للمراجعة." actions={<ActionLink href="/store/sell">إضافة صنف</ActionLink>}/>}</section>}

    {view==="hours"&&<Surface className={styles.hoursPanel}><div className={styles.sectionHeading}><div><span>التشغيل الأسبوعي</span><h2>ساعات استقبال الطلبات</h2></div><ActionButton type="button" disabled={savingHours} onClick={()=>void saveHours()}>{savingHours?"جاري الحفظ…":"حفظ الساعات"}</ActionButton></div><div className={styles.hoursGrid}>{hours.map((h,index)=><div key={h.dayOfWeek} className={styles.hourRow}><strong>{days[h.dayOfWeek]}</strong><label><input type="checkbox" checked={h.isClosed} onChange={e=>setHours(current=>current.map((item,i)=>i===index?{...item,isClosed:e.target.checked}:item))}/> مغلق</label><label>من<input type="time" value={h.openTime} disabled={h.isClosed} onChange={e=>setHours(current=>current.map((item,i)=>i===index?{...item,openTime:e.target.value}:item))}/></label><label>إلى<input type="time" value={h.closeTime} disabled={h.isClosed} onChange={e=>setHours(current=>current.map((item,i)=>i===index?{...item,closeTime:e.target.value}:item))}/></label></div>)}</div></Surface>}

    {view==="promotions"&&isRestaurant&&<section className={styles.promotionsLayout}>
      <Surface className={styles.promotionForm}><div className={styles.sectionHeading}><div><span>تمويل المطعم</span><h2>إنشاء كود خصم</h2></div></div><p className={styles.muted}>يُخصم المبلغ من سلة هذا المطعم فقط. لا يشمل رسوم التوصيل ولا تموله المنصة.</p>
        <div className={styles.promotionFields}>
          <label>الكود<input dir="ltr" autoCapitalize="characters" maxLength={32} value={promotionDraft.code} onChange={e=>setPromotionDraft(d=>({...d,code:e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,'')}))} placeholder="FOOD20"/></label>
          <label>اسم الحملة<input maxLength={100} value={promotionDraft.nameAr} onChange={e=>setPromotionDraft(d=>({...d,nameAr:e.target.value}))} placeholder="خصم نهاية الأسبوع"/></label>
          <label>نوع الخصم<select value={promotionDraft.discountType} onChange={e=>setPromotionDraft(d=>({...d,discountType:e.target.value as 'percentage'|'fixed',maximumDiscount:e.target.value==='fixed'?'':d.maximumDiscount}))}><option value="percentage">نسبة مئوية</option><option value="fixed">مبلغ ثابت</option></select></label>
          <label>{promotionDraft.discountType==="percentage"?"النسبة (1–90)":"قيمة الخصم"}<input type="number" min="0.01" max={promotionDraft.discountType==="percentage"?90:undefined} step={promotionDraft.discountType==="percentage"?1:.01} value={promotionDraft.value} onChange={e=>setPromotionDraft(d=>({...d,value:e.target.value}))}/></label>
          <label>العملة<select value={promotionDraft.currency} onChange={e=>setPromotionDraft(d=>({...d,currency:e.target.value as 'SYP'|'USD'}))}><option value="SYP">ليرة سورية</option><option value="USD">دولار</option></select></label>
          <label>الحد الأدنى للسلة<input type="number" min="0" step="0.01" value={promotionDraft.minimumSubtotal} onChange={e=>setPromotionDraft(d=>({...d,minimumSubtotal:e.target.value}))}/></label>
          {promotionDraft.discountType==="percentage"&&<label>سقف الخصم (اختياري)<input type="number" min="0.01" step="0.01" value={promotionDraft.maximumDiscount} onChange={e=>setPromotionDraft(d=>({...d,maximumDiscount:e.target.value}))}/></label>}
          <label>صالح من<input type="datetime-local" value={promotionDraft.validFrom} onChange={e=>setPromotionDraft(d=>({...d,validFrom:e.target.value}))}/></label>
          <label>صالح حتى<input type="datetime-local" value={promotionDraft.validUntil} onChange={e=>setPromotionDraft(d=>({...d,validUntil:e.target.value}))}/></label>
          <label>إجمالي الاستخدامات (اختياري)<input type="number" min="1" step="1" value={promotionDraft.maxRedemptions} onChange={e=>setPromotionDraft(d=>({...d,maxRedemptions:e.target.value}))}/></label>
          <label>حد العميل<input type="number" min="1" max="20" step="1" value={promotionDraft.perUserLimit} onChange={e=>setPromotionDraft(d=>({...d,perUserLimit:e.target.value}))}/></label>
        </div><ActionButton type="button" disabled={savingPromotion} onClick={()=>void createPromotion()}>{savingPromotion?"جاري الإنشاء…":"إنشاء الحملة"}</ActionButton>
      </Surface>
      <div className={styles.promotionList}>{promotions.length?promotions.map(p=><Surface as="article" key={p.id} className={styles.promotionCard}><div className={styles.orderTop}><strong><bdi>{p.code}</bdi></strong><span className={p.active?styles.online:styles.offline}>{p.active?"مفعّل":"متوقف"}</span></div><h2>{p.nameAr}</h2><p>{p.discountType==="percentage"?`${p.percentageOff}%${p.maximumDiscount?` · حتى ${money(p.maximumDiscount,p.currency)}`:''}`:money(p.fixedAmount??0,p.currency)} · حد السلة {money(p.minimumSubtotal,p.currency)}</p><p>من {new Date(p.validFrom).toLocaleString('ar-SY')}<br/>حتى {new Date(p.validUntil).toLocaleString('ar-SY')}</p><p>حد العميل: {p.perUserLimit}{p.maxRedemptions?` · إجمالي: ${p.maxRedemptions}`:' · الإجمالي غير محدود'}</p><ActionButton type="button" variant={p.active?"secondary":"primary"} disabled={promotionActionId===p.id} onClick={()=>void setPromotionActive(p)}>{promotionActionId===p.id?"جاري الحفظ…":p.active?"إيقاف الحملة":"تفعيل الحملة"}</ActionButton></Surface>):<EmptyState title="لا توجد حملات خصم" description="أنشئ كوداً ممولاً من مطعمك ليُطبّق على سلة الطعام فقط."/>}</div>
    </section>}

    {orderDialog&&<div className="moderation-dialog-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target&&!orderActionInFlight.current)setOrderDialog(null)}}><section className="moderation-dialog" role="dialog" aria-modal="true" aria-labelledby="merchant-order-dialog-title"><h3 id="merchant-order-dialog-title">{orderDialog.action==="quote"?"مراجعة ورسوم التوصيل":orderDialog.action==="recall"?"سحب مهمة المندوب":"رفض الطلب"}</h3><p>{orderDialog.action==="quote"?"راجع الأصناف ثم أدخل رسوم التوصيل. لن يثبت الطلب أو يُعيّن المندوب حتى يوافق العميل على الإجمالي.":orderDialog.action==="recall"?"اكتب سبب سحب المهمة. سيُبلغ المندوب الحالي ويعود الطلب لاختيار مندوب متاح آخر.":"سجّل سبب الرفض بوضوح ليظهر في سجل الطلب."}</p>{orderDialog.action==="quote"&&orderDialog.order.promoCode&&<p>خصم مطعم ممول منك: <bdi>{orderDialog.order.promoCode}</bdi> · -{money(orderDialog.order.discountAmount,orderDialog.order.currency)}. رسوم التوصيل تضاف بعد الخصم.</p>}{orderDialog.action==="quote"?<div className={styles.dialogForm}><label>رسوم التوصيل<input type="number" min="0" step="1" inputMode="decimal" value={deliveryFee} onChange={event=>setDeliveryFee(event.target.value)} autoFocus/></label>{orderDialog.order.vertical==="pharmacy"&&<label className={styles.confirmRow}><input type="checkbox" checked={pharmacyApproved} onChange={event=>setPharmacyApproved(event.target.checked)}/> أؤكد أن الصيدلي راجع الطلب ووافق على صرف الأصناف المسموح بها.</label>}</div>:<textarea className="moderation-reason" rows={5} autoFocus maxLength={300} value={rejectionReason} onChange={event=>setRejectionReason(event.target.value)} placeholder={orderDialog.action==="recall"?"سبب سحب المهمة…":"سبب رفض الطلب…"}/>}<div className="moderation-actions"><button type="button" disabled={!!orderActionId} onClick={()=>setOrderDialog(null)}>إلغاء</button><button type="button" className={orderDialog.action==="reject"?"moderation-reject":"moderation-approve"} disabled={!!orderActionId||(orderDialog.action==="quote"?deliveryFee.trim()===""||(orderDialog.order.vertical==="pharmacy"&&!pharmacyApproved):!rejectionReason.trim())} onClick={()=>void saveOrderDialog()}>{orderActionId?"جارٍ الحفظ…":orderDialog.action==="quote"?"إرسال الإجمالي للعميل":orderDialog.action==="recall"?"سحب المهمة":"تأكيد الرفض"}</button></div></section></div>}
  </PageShell>;
}
