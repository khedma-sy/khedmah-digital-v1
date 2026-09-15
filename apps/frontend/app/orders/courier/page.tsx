"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  type FulfillmentOrder,
  type PublicBusinessProfile,
} from "../../../lib/recovered-service-client";
import {
  ActionButton,
  ActionLink,
  EmptyState,
  PageHeader,
  PageShell,
  SkeletonGrid,
  StatusMessage,
  Surface,
} from "../../components/ui-primitives";
import { PlatformIcon } from "../../components/platform-icon";
import { CourierLocationButton } from "../courier-location-button";
import {
  playOrderRing,
  requestOrderNotifications,
  showOrderNotification,
} from "../order-alerts";
import { CourierEvidenceDialog } from "./courier-evidence-dialog";
import { OrderTimeline } from "../order-timeline";
import styles from "./courier.module.css";

const statusLabel: Record<FulfillmentOrder["status"], string> = {
  placed: "بانتظار مراجعة المنشأة",
  quoted: "بانتظار موافقة العميل",
  merchant_confirmed: "بانتظار تعيين مندوب",
  courier_assigned: "مهمة جديدة",
  courier_accepted: "تم قبول المهمة",
  ready_for_pickup: "جاهز للاستلام",
  picked_up: "في الطريق إلى العميل",
  delivered: "تم التسليم والتحصيل",
  rejected: "مرفوض",
  cancelled: "ملغي",
};

type CourierConfirmation = {
  order: FulfillmentOrder;
  status: "picked_up" | "delivered";
};

export default function CourierOrders() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [selected, setSelected] = useState("");
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [confirmation, setConfirmation] = useState<CourierConfirmation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const alertsEnabledRef = useRef(false);
  const loadedOnceRef = useRef(false);
  const actionInFlight = useRef(false);
  const selectedRef = useRef("");
  const requestSequenceRef = useRef(0);
  const knownOrderStatusesRef = useRef<Map<string, FulfillmentOrder["status"]>>(new Map());

  useEffect(() => {
    const enabled = window.localStorage.getItem("khedmah-courier-order-alerts") === "on";
    alertsEnabledRef.current = enabled;
    setAlertsEnabled(enabled);
  }, []);
  useEffect(() => {
    void api.businesses
      .listMine()
      .then((r) => {
        const list = r.businesses.filter(
          (b) => b.categoryCode === "delivery_courier",
        );
        setBusinesses(list);
        setSelected(list[0]?.id ?? "");
      })
      .catch((c) => {
        if (
          c instanceof Error &&
          (c as Error & { statusCode?: number }).statusCode === 401
        )
          router.replace("/auth/login?next=%2Forders%2Fcourier");
        else setError("تعذر تحميل نشاط المندوب.");
      })
      .finally(() => setLoading(false));
  }, [router]);
  const announceNewTasks = useCallback((incoming: FulfillmentOrder[]) => {
    const fresh = incoming.filter((order) =>
      order.status === "courier_assigned" &&
      knownOrderStatusesRef.current.get(order.id) !== "courier_assigned",
    );
    const ready = incoming.filter((order) =>
      order.status === "ready_for_pickup" &&
      knownOrderStatusesRef.current.get(order.id) !== "ready_for_pickup",
    );
    knownOrderStatusesRef.current = new Map(incoming.map((order) => [order.id, order.status]));
    if (!loadedOnceRef.current || (!fresh.length && !ready.length) || !alertsEnabledRef.current) return;
    playOrderRing();
    if (fresh.length) showOrderNotification(
        "مهمة توصيل جديدة",
        fresh.length === 1
          ? `${fresh[0].merchantName} بانتظار قبولك أو اعتذارك.`
          : `${fresh.length} مهام جديدة بانتظار ردك.`,
        `courier-order-${fresh[0].id}`,
      );
    else showOrderNotification(
      "الطلب جاهز للاستلام",
      ready.length === 1 ? `${ready[0].merchantName} جهّز الطلب.` : `${ready.length} طلبات جاهزة للاستلام.`,
      `courier-ready-${ready[0].id}`,
    );
  }, []);
  const load = useCallback(async (id: string) => {
    if (!id) return;
    const request = ++requestSequenceRef.current;
    const next = (await api.orders.courier(id)).orders;
    if (selectedRef.current !== id || request !== requestSequenceRef.current) return;
    announceNewTasks(next);
    setOrders(next);
    setError("");
    loadedOnceRef.current = true;
  }, [announceNewTasks]);
  useEffect(() => {
    selectedRef.current = selected;
    requestSequenceRef.current += 1;
    setOrders([]);
    loadedOnceRef.current = false;
    knownOrderStatusesRef.current = new Map();
    if (!selected) return;
    void load(selected).catch((c) =>
      setError(c instanceof Error ? c.message : "تعذر تحميل المهام."),
    );
    const interval = window.setInterval(() => {
      void load(selected).catch(() => undefined);
    }, 8000);
    return () => {
      if (selectedRef.current === selected) selectedRef.current = "";
      requestSequenceRef.current += 1;
      window.clearInterval(interval);
    };
  }, [load, selected]);

  async function enableAlerts() {
    alertsEnabledRef.current = true;
    setAlertsEnabled(true);
    window.localStorage.setItem("khedmah-courier-order-alerts", "on");
    playOrderRing();
    await requestOrderNotifications();
  }
  async function move(o: FulfillmentOrder, status: FulfillmentOrder["status"]): Promise<boolean> {
    if (actionInFlight.current) return false;
    actionInFlight.current = true;
    setActionLoadingId(o.id);
    setError("");
    try {
      await api.orders.transition(
        o.id,
        status,
        status === "merchant_confirmed" ? { reason: "المندوب غير متاح" } : {},
      );
      await load(selected);
      return true;
    } catch (c) {
      setError(c instanceof Error ? c.message : "تعذر تحديث المهمة.");
      return false;
    } finally {
      actionInFlight.current = false;
      setActionLoadingId("");
    }
  }
  async function confirmEvidence() {
    if (!confirmation || actionInFlight.current) return;
    const current = confirmation;
    if (await move(current.order, current.status)) setConfirmation(null);
  }
  const activeOrders = orders.filter((o) => !["delivered", "rejected", "cancelled"].includes(o.status));
  const closedOrders = orders.filter((o) => ["delivered", "rejected", "cancelled"].includes(o.status));

  function renderOrder(o: FulfillmentOrder) {
    const busy = actionLoadingId === o.id;
    const nextStep = o.status === "courier_assigned" ? "راجع نقطتي الاستلام والتسليم ثم اقبل أو اعتذر."
      : o.status === "courier_accepted" ? "توجّه إلى المنشأة وابدأ مشاركة موقعك؛ ستصلك رنة عندما يصبح الطلب جاهزًا."
      : o.status === "ready_for_pickup" ? "تحقق من الأصناف، ثم أكد الاستلام بعد استلامها فعليًا."
      : o.status === "picked_up" ? "توجّه إلى العميل، سلّم الطلب، حصّل المبلغ، ثم أكد الإغلاق."
      : o.status === "delivered" ? "اكتملت المهمة وسُجل التحصيل النقدي." : "هذه المهمة مغلقة.";
    return (
      <Surface as="article" className={styles.orderCard} key={o.id} aria-busy={busy}>
        <span className={styles.status}><PlatformIcon name="delivery" size={16}/>{statusLabel[o.status]}</span>
        <h2>{o.merchantName}</h2>
        <p className={styles.nextStep}>{nextStep}</p>
        <dl className={styles.orderDetails}>
          <div><dt><PlatformIcon name="storefront" size={17}/>عنوان الاستلام</dt><dd>{o.pickupAddress || "تواصل مع المنشأة لتأكيد نقطة الاستلام"}</dd></div>
          {o.merchantPhone && <div><dt><PlatformIcon name="phone" size={17}/>رقم المنشأة</dt><dd><a href={`tel:${o.merchantPhone}`} dir="ltr">{o.merchantPhone}</a></dd></div>}
          <div><dt><PlatformIcon name="pin" size={17}/>عنوان التسليم</dt><dd>{o.deliveryAddress}</dd></div>
          <div><dt><PlatformIcon name="phone" size={17}/>رقم العميل</dt><dd>{o.customerPhone ? <a href={`tel:${o.customerPhone}`} dir="ltr">{o.customerPhone}</a> : "يظهر بعد قبول المهمة"}</dd></div>
          <div><dt><PlatformIcon name="cart" size={17}/>محتوى الطلب</dt><dd><ul className={styles.itemList}>{o.items.map((item) => <li key={item.productListingId}>{o.items.length > 0 ? item.quantity.toLocaleString("ar-SY-u-nu-latn") : "0"} × {item.titleAr}</li>)}</ul></dd></div>
          {o.customerNote && <div><dt><PlatformIcon name="info" size={17}/>ملاحظة العميل</dt><dd>{o.customerNote}</dd></div>}
          {o.total !== undefined && <div><dt><PlatformIcon name="check" size={17}/>التحصيل النقدي</dt><dd>{o.total.toLocaleString("ar-SY-u-nu-latn")} {o.currency}</dd></div>}
        </dl>
        <OrderTimeline events={o.events} />
        <div className={styles.orderActions}>
          {["courier_accepted", "ready_for_pickup", "picked_up"].includes(o.status) && <CourierLocationButton orderId={o.id} status={o.status} />}
          {o.status === "courier_assigned" && <><ActionButton disabled={busy || actionInFlight.current} onClick={() => void move(o, "courier_accepted")}>{busy ? "جارٍ الحفظ…" : "قبول المهمة"}</ActionButton><ActionButton disabled={busy || actionInFlight.current} variant="secondary" onClick={() => void move(o, "merchant_confirmed")}>غير متاح</ActionButton></>}
          {["courier_accepted", "ready_for_pickup"].includes(o.status) && <ActionButton disabled={busy || actionInFlight.current} variant="secondary" onClick={() => void move(o, "merchant_confirmed")}>تعذّر إكمال المهمة</ActionButton>}
          {o.status === "ready_for_pickup" && <ActionButton disabled={busy || actionInFlight.current} onClick={() => setConfirmation({ order: o, status: "picked_up" })}>{busy ? "جارٍ الحفظ…" : "استلمت الطلب"}</ActionButton>}
          {o.status === "picked_up" && <ActionButton disabled={busy || actionInFlight.current} onClick={() => setConfirmation({ order: o, status: "delivered" })}>{busy ? "جارٍ الحفظ…" : "تم التسليم وتحصيل النقد"}</ActionButton>}
        </div>
      </Surface>
    );
  }
  if (loading)
    return (
      <PageShell className={styles.page} label="مهام المندوب">
        <SkeletonGrid count={3} />
      </PageShell>
    );
  return (
    <PageShell className={styles.page} label="مهام المندوب">
      <PageHeader
        eyebrow="الدفع نقدي عند التسليم"
        title="مهام التوصيل"
        description="اقبل المهمة، استلم الطلب الجاهز، ثم أكد التسليم والتحصيل النقدي."
        backHref="/users/me"
        actions={<ActionLink href="/courier-signup" variant="secondary">ملفي ووثائق المندوب</ActionLink>}
      />
      <details className={styles.guide} id="courier-guide">
        <summary>
          <span className={styles.guideIcon}><PlatformIcon name="info" size={21} /></span>
          <span><strong>شرح مهام مندوب التوصيل</strong><small>افتح الدليل قبل قبول أول مهمة</small></span>
          <PlatformIcon name="arrow" size={18} />
        </summary>
        <div className={styles.guideBody}>
          <ol>
            <li><span>1</span><div><strong>راجع المهمة</strong><p>تحقق من اسم المنشأة وعنوان العميل وقيمة المبلغ النقدي المطلوب تحصيله.</p></div></li>
            <li><span>2</span><div><strong>اقبل أو اعتذر</strong><p>اقبل المهمة فقط عندما تستطيع تنفيذها، أو اختر «غير متاح» لتعود إلى المنشأة.</p></div></li>
            <li><span>3</span><div><strong>شارك موقعك</strong><p>ابدأ مشاركة الموقع بعد القبول وأبقها فعّالة أثناء الاستلام والتوصيل ليتمكن العميل من المتابعة.</p></div></li>
            <li><span>4</span><div><strong>ثبّت الاستلام</strong><p>اضغط «استلمت الطلب» بعد استلامه فعليًا من المنشأة.</p></div></li>
            <li><span>5</span><div><strong>سلّم وحصّل النقد</strong><p>لا تؤكد التسليم إلا بعد تسليم الطلب للعميل وتحصيل المبلغ الظاهر في المهمة.</p></div></li>
          </ol>
          <p className={styles.safetyNote}><PlatformIcon name="check" size={17}/>كل تغيير حالة يُحفظ في سجل الطلب، ومشاركة الموقع تعمل فقط خلال المهمة النشطة.</p>
        </div>
      </details>
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      {!businesses.length ? (
        <EmptyState
          title="لا يوجد نشاط مندوب"
          description="سجّل نشاط مندوب توصيل وأكمل اعتماده أولاً."
          actions={
            <ActionLink href="/business-profiles/new">تسجيل مندوب</ActionLink>
          }
        />
      ) : (
        <>
          <Surface className={styles.courierSelector}>
            <div className="ui-form-stack">
              <label htmlFor="courier-business">
                نشاط المندوب
                <select
                  id="courier-business"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="ui-page-actions">
                <ActionButton
                  type="button"
                  variant="secondary"
                  disabled={alertsEnabled}
                  onClick={() => void enableAlerts()}
                >
                  {alertsEnabled ? "رنة المهام مفعّلة" : "فعّل رنة المهام الجديدة"}
                </ActionButton>
              </div>
            </div>
          </Surface>
          {activeOrders.length ? (
            <section className={styles.orderGrid} aria-label="مهام التوصيل الحالية">
              {activeOrders.map(renderOrder)}
            </section>
          ) : (
            <EmptyState
              title="لا توجد مهام"
              description="تظهر هنا الطلبات التي تختارك المنشآت لتوصيلها."
            />
          )}
          {closedOrders.length ? <details className={styles.history}><summary>سجل المهام المنتهية ({closedOrders.length.toLocaleString("ar-SY-u-nu-latn")})</summary><section className={styles.orderGrid}>{closedOrders.map(renderOrder)}</section></details> : null}
        </>
      )}
      {confirmation && <CourierEvidenceDialog
        order={confirmation.order}
        status={confirmation.status}
        saving={actionLoadingId === confirmation.order.id}
        onCancel={() => { if (!actionInFlight.current) setConfirmation(null); }}
        onConfirm={() => void confirmEvidence()}
      />}
    </PageShell>
  );
}
