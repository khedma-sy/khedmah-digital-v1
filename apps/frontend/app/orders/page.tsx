"use client";
import { useEffect, useState } from "react";
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
export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = () =>
    api.orders
      .mine()
      .then((r) => setOrders(r.orders))
      .catch((c) => {
        if (
          c instanceof Error &&
          (c as Error & { statusCode?: number }).statusCode === 401
        )
          router.replace("/auth/login?next=%2Forders");
        else setError(c instanceof Error ? c.message : "تعذر تحميل الطلبات.");
      })
      .finally(() => setLoading(false));
  useEffect(() => {
    void load();
  }, []);
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
                الأصناف: {o.subtotal.toLocaleString("ar-SY")} {o.currency}
              </p>
              {o.total !== undefined && (
                <p>
                  الإجمالي النقدي:{" "}
                  <strong>
                    {o.total.toLocaleString("ar-SY")} {o.currency}
                  </strong>
                </p>
              )}
              {o.courierName && <p>المندوب: {o.courierName}</p>}
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
