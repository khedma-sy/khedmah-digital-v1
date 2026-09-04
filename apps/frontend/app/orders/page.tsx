"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type FulfillmentOrder } from "../../lib/api-client";
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
export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadedOnceRef = useRef(false);
  const priorStatusesRef = useRef<Map<string, FulfillmentOrder["status"]>>(new Map());
  const load = useCallback(async () => {
    try {
      const response = await api.orders.mine();
      if (loadedOnceRef.current) {
        response.orders.forEach((order) => {
          const prior = priorStatusesRef.current.get(order.id);
          const notice = customerNotice[order.status];
          if (prior && prior !== order.status && notice)
            showOrderNotification(
              label[order.status],
              `${order.merchantName}: ${notice}`,
              `customer-order-${order.id}-${order.status}`,
            );
        });
      }
      priorStatusesRef.current = new Map(
        response.orders.map((order) => [order.id, order.status]),
      );
      loadedOnceRef.current = true;
      setOrders(response.orders);
      setError("");
    } catch (c) {
        if (
          c instanceof Error &&
          (c as Error & { statusCode?: number }).statusCode === 401
        )
          router.replace("/auth/login?next=%2Forders");
        else setError(c instanceof Error ? c.message : "تعذر تحميل الطلبات.");
    } finally {
      setLoading(false);
    }
  }, [router]);
  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(interval);
  }, [load]);
  async function move(o: FulfillmentOrder, status: FulfillmentOrder["status"]) {
    try {
      await api.orders.transition(o.id, status);
      await load();
    } catch (c) {
      setError(c instanceof Error ? c.message : "تعذر تحديث الطلب.");
    }
  }
  async function rate(o: FulfillmentOrder, target: "merchant" | "courier") {
    const raw = window.prompt(
      `قيّم ${target === "merchant" ? "المنشأة" : "المندوب"} من 1 إلى 5`,
    );
    if (!raw) return;
    const score = Number(raw);
    const comment = window.prompt("تعليق اختياري") ?? undefined;
    try {
      await api.orders.rate(o.id, target, score, comment);
      setError("تم حفظ التقييم بنجاح.");
    } catch (c) {
      setError(c instanceof Error ? c.message : "تعذر حفظ التقييم.");
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
        backHref="/store"
      />
      <div className="ui-page-actions">
        <ActionLink href="/store">تصفح المنتجات</ActionLink>
      </div>
      {error && (
        <StatusMessage tone={error.startsWith("تم ") ? "success" : "danger"}>
          {error}
        </StatusMessage>
      )}
      {orders.length ? (
        <section className="ui-card-grid">
          {orders.map((o) => (
            <Surface as="article" key={o.id}>
              <strong>{label[o.status]}</strong>
              <h2>{o.merchantName}</h2>
              {o.items.map((i) => (
                <p key={i.productListingId}>
                  {i.titleAr} × {i.quantity}
                </p>
              ))}
              <p>
                الأصناف: {o.subtotal.toLocaleString("ar-SY-u-nu-latn")} {o.currency}
              </p>
              {o.total !== undefined && (
                <p>
                  الإجمالي النقدي:{" "}
                  <strong>
                    {o.total.toLocaleString("ar-SY-u-nu-latn")} {o.currency}
                  </strong>
                </p>
              )}
              {o.courierName && <p>المندوب: {o.courierName}</p>}
              {o.courierPhone && <p>رقم المندوب: <a href={`tel:${o.courierPhone}`} dir="ltr">{o.courierPhone}</a></p>}
              {["courier_accepted", "ready_for_pickup", "picked_up"].includes(o.status) && (
                <OrderTracking orderId={o.id} status={o.status} />
              )}
              <div className="ui-page-actions">
                {o.courierBusinessId && (
                  <ActionLink href={`/business-profiles/${encodeURIComponent(o.courierBusinessId)}?source=order`} variant="secondary">
                    التواصل مع المندوب
                  </ActionLink>
                )}
                {o.status === "quoted" && (
                  <ActionButton
                    onClick={() => void move(o, "merchant_confirmed")}
                  >
                    أوافق على الإجمالي
                  </ActionButton>
                )}
                {["placed", "quoted"].includes(o.status) && (
                  <ActionButton
                    variant="secondary"
                    onClick={() => void move(o, "cancelled")}
                  >
                    إلغاء الطلب
                  </ActionButton>
                )}
                {o.status === "delivered" && (
                  <>
                    <ActionButton
                      variant="secondary"
                      onClick={() => void rate(o, "merchant")}
                    >
                      تقييم المنشأة
                    </ActionButton>
                    {o.courierBusinessId && (
                      <ActionButton
                        variant="secondary"
                        onClick={() => void rate(o, "courier")}
                      >
                        تقييم المندوب
                      </ActionButton>
                    )}
                  </>
                )}
              </div>
            </Surface>
          ))}
        </section>
      ) : (
        <EmptyState
          title="لا توجد طلبات"
          description="اختر منتجاً من مطعم أو متجر غذائي أو صيدلية وابدأ طلباً نقدياً حقيقياً."
          actions={<ActionLink href="/store">تصفح المنتجات</ActionLink>}
        />
      )}
    </PageShell>
  );
}
