"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type FulfillmentOrder } from "../../lib/recovered-service-client";
import {
  ActionButton,
  ActionLink,
  EmptyState,
  PageHeader,
  PageShell,
  SkeletonGrid,
  StatusMessage,
  Surface,
} from "../components/ui-primitives";
import { OrderTracking } from "./order-tracking";
import { OrderTimeline } from "./order-timeline";
import { showOrderNotification } from "./order-alerts";

const label: Record<FulfillmentOrder["status"], string> = {
  placed: "بانتظار مراجعة المنشأة",
  quoted: "بانتظار موافقتك على الإجمالي",
  merchant_confirmed: "تم تثبيت الطلب",
  courier_assigned: "بانتظار المندوب",
  courier_accepted: "قبله المندوب",
  ready_for_pickup: "جاهز للاستلام",
  picked_up: "في الطريق",
  delivered: "تم التسليم والتحصيل النقدي",
  rejected: "مرفوض",
  cancelled: "ملغي",
};
const customerNotice: Partial<Record<FulfillmentOrder["status"], string>> = {
  quoted: "أرسل المطعم الإجمالي ورسوم التوصيل لموافقتك.",
  merchant_confirmed: "ثُبّت طلبك ويجري اختيار مندوب معتمد.",
  courier_accepted: "قبل المندوب طلبك وسيستلمه من المطعم.",
  ready_for_pickup: "أصبح طلبك جاهزاً لاستلام المندوب.",
  picked_up: "استلم المندوب طلبك وهو في الطريق إليك.",
  delivered: "وصل طلبك وتم تسجيل التسليم.",
  rejected: "تعذر على المطعم قبول الطلب.",
};
type RatingDialog = { order: FulfillmentOrder; target: "merchant" | "courier" };

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [ratingDialog, setRatingDialog] = useState<RatingDialog | null>(null);
  const [ratingScore, setRatingScore] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSaving, setRatingSaving] = useState(false);
  const loadedOnceRef = useRef(false);
  const priorStatusesRef = useRef<Map<string, FulfillmentOrder["status"]>>(new Map());
  const requestSequence = useRef(0);
  const actionInFlight = useRef(false);

  const load = useCallback(async () => {
    const request = ++requestSequence.current;
    try {
      const response = await api.orders.mine();
      if (request !== requestSequence.current) return;
      if (loadedOnceRef.current) {
        response.orders.forEach((order) => {
          const prior = priorStatusesRef.current.get(order.id);
          const message = customerNotice[order.status];
          if (prior && prior !== order.status && message)
            showOrderNotification(
              label[order.status],
              `${order.merchantName}: ${message}`,
              `customer-order-${order.id}-${order.status}`,
            );
        });
      }
      priorStatusesRef.current = new Map(response.orders.map((order) => [order.id, order.status]));
      loadedOnceRef.current = true;
      setOrders(response.orders);
      setError("");
    } catch (cause) {
      if (request !== requestSequence.current) return;
      if (cause instanceof Error && (cause as Error & { statusCode?: number }).statusCode === 401)
        router.replace("/auth/login?next=%2Forders");
      else setError(cause instanceof Error ? cause.message : "تعذر تحميل الطلبات.");
    } finally {
      if (request === requestSequence.current) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 8000);
    return () => {
      requestSequence.current += 1;
      window.clearInterval(interval);
    };
  }, [load]);

  async function move(order: FulfillmentOrder, status: FulfillmentOrder["status"]) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setActionLoadingId(order.id);
    setError("");
    setNotice("");
    try {
      await api.orders.transition(order.id, status);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحديث الطلب.");
    } finally {
      actionInFlight.current = false;
      setActionLoadingId("");
    }
  }

  function openRating(order: FulfillmentOrder, target: "merchant" | "courier") {
    if (ratingSaving || actionInFlight.current) return;
    setRatingDialog({ order, target });
    setRatingScore(5);
    setRatingComment("");
    setError("");
    setNotice("");
  }

  async function submitRating(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ratingDialog || ratingSaving || actionInFlight.current) return;
    if (!Number.isInteger(ratingScore) || ratingScore < 1 || ratingScore > 5) {
      setError("اختر تقييمًا من 1 إلى 5.");
      return;
    }
    const comment = ratingComment.trim();
    if (comment.length > 500) {
      setError("التعليق طويل جدًا.");
      return;
    }
    setRatingSaving(true);
    setError("");
    try {
      await api.orders.rate(ratingDialog.order.id, ratingDialog.target, ratingScore, comment || undefined);
      const targetLabel = ratingDialog.target === "merchant" ? "المنشأة" : "المندوب";
      setRatingDialog(null);
      setRatingComment("");
      setNotice(`تم حفظ تقييم ${targetLabel} بنجاح.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ التقييم.");
    } finally {
      setRatingSaving(false);
    }
  }

  if (loading)
    return (
      <PageShell label="طلباتي">
        <SkeletonGrid count={3} />
      </PageShell>
    );
  return (
    <PageShell label="طلباتي">
      <PageHeader
        eyebrow="الدفع نقدي"
        title="طلباتي"
        description="تابع قبول المنشأة والمندوب والاستلام والتسليم من سجل واحد."
        backHref="/restaurants"
      />
      <div className="ui-page-actions">
        <ActionLink href="/restaurants">تصفح المطاعم</ActionLink>
        <ActionLink href="/store" variant="secondary">تصفح المتجر</ActionLink>
      </div>
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      {notice && <StatusMessage tone="success">{notice}</StatusMessage>}

      {ratingDialog && (
        <Surface as="section" role="dialog" aria-labelledby="order-rating-title" className="ui-form-stack">
          <h2 id="order-rating-title">تقييم {ratingDialog.target === "merchant" ? "المنشأة" : "المندوب"}</h2>
          <p>الطلب من {ratingDialog.order.merchantName}. التقييم متاح فقط بعد التسليم ويمكن تسجيله مرة واحدة لكل جهة.</p>
          <form className="ui-form-stack" onSubmit={submitRating}>
            <label>
              التقييم من 1 إلى 5
              <select value={ratingScore} onChange={(event) => setRatingScore(Number(event.target.value))} disabled={ratingSaving}>
                <option value={5}>5 — ممتاز</option>
                <option value={4}>4 — جيد جدًا</option>
                <option value={3}>3 — جيد</option>
                <option value={2}>2 — يحتاج تحسين</option>
                <option value={1}>1 — غير مرضٍ</option>
              </select>
            </label>
            <label>
              تعليق اختياري
              <textarea value={ratingComment} maxLength={500} rows={4} onChange={(event) => setRatingComment(event.target.value)} disabled={ratingSaving} placeholder="اكتب ملاحظة مفيدة عن التجربة…" />
            </label>
            <div className="ui-page-actions">
              <ActionButton type="submit" disabled={ratingSaving}>{ratingSaving ? "جارٍ حفظ التقييم…" : "حفظ التقييم"}</ActionButton>
              <ActionButton type="button" variant="secondary" disabled={ratingSaving} onClick={() => setRatingDialog(null)}>إلغاء</ActionButton>
            </div>
          </form>
        </Surface>
      )}

      {orders.length ? (
        <section className="ui-card-grid">
          {orders.map((order) => {
            const busy = actionLoadingId === order.id;
            return <Surface as="article" key={order.id} aria-busy={busy}>
              <strong>{label[order.status]}</strong>
              <h2>{order.merchantName}</h2>
              {order.items.map((item) => (
                <p key={item.productListingId}>
                  {item.titleAr} × {item.quantity}
                </p>
              ))}
              <p>
                الأصناف: {order.subtotal.toLocaleString("ar-SY-u-nu-latn")} {order.currency}
              </p>
              {order.promoCode && order.discountAmount > 0 && <p>
                كود الخصم <bdi>{order.promoCode}</bdi>: -{order.discountAmount.toLocaleString("ar-SY-u-nu-latn")} {order.currency}
                {" · "}الأصناف بعد الخصم: {(order.subtotal - order.discountAmount).toLocaleString("ar-SY-u-nu-latn")} {order.currency}
              </p>}
              {order.total !== undefined && (
                <p>
                  الإجمالي النقدي:{" "}
                  <strong>
                    {order.total.toLocaleString("ar-SY-u-nu-latn")} {order.currency}
                  </strong>
                </p>
              )}
              {order.courierName && <p>المندوب: {order.courierName}</p>}
              {order.courierPhone && <p>رقم المندوب: <a href={`tel:${order.courierPhone}`} dir="ltr">{order.courierPhone}</a></p>}
              {order.rejectionReason && <StatusMessage tone="danger">سبب الرفض: {order.rejectionReason}</StatusMessage>}
              <OrderTimeline events={order.events} />
              {["courier_accepted", "ready_for_pickup", "picked_up"].includes(order.status) && (
                <OrderTracking orderId={order.id} status={order.status} />
              )}
              <div className="ui-page-actions">
                {order.courierBusinessId && (
                  <ActionLink href={`/business-profiles/${encodeURIComponent(order.courierBusinessId)}?source=order`} variant="secondary">
                    التواصل مع المندوب
                  </ActionLink>
                )}
                {order.status === "quoted" && (
                  <ActionButton disabled={busy || actionInFlight.current} onClick={() => void move(order, "merchant_confirmed")}>
                    {busy ? "جارٍ الحفظ…" : "أوافق على الإجمالي"}
                  </ActionButton>
                )}
                {["placed", "quoted", "merchant_confirmed"].includes(order.status) && (
                  <ActionButton variant="secondary" disabled={busy || actionInFlight.current} onClick={() => void move(order, "cancelled")}>
                    {busy ? "جارٍ الحفظ…" : "إلغاء الطلب"}
                  </ActionButton>
                )}
                {order.status === "delivered" && (
                  <>
                    <ActionButton variant="secondary" disabled={ratingSaving || actionInFlight.current} onClick={() => openRating(order, "merchant")}>
                      تقييم المنشأة
                    </ActionButton>
                    {order.courierBusinessId && (
                      <ActionButton variant="secondary" disabled={ratingSaving || actionInFlight.current} onClick={() => openRating(order, "courier")}>
                        تقييم المندوب
                      </ActionButton>
                    )}
                  </>
                )}
              </div>
            </Surface>;
          })}
        </section>
      ) : (
        <EmptyState
          title="لا توجد طلبات"
          description="اختر منتجاً من مطعم أو متجر غذائي أو صيدلية وابدأ طلباً نقدياً حقيقياً."
          actions={<ActionLink href="/restaurants">تصفح المطاعم</ActionLink>}
        />
      )}
    </PageShell>
  );
}
