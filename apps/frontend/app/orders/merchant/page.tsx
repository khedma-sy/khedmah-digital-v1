"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  type FulfillmentOrder,
  type PublicBusinessProfile,
} from "../../../lib/api-client";
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
import {
  playOrderRing,
  requestOrderNotifications,
  showOrderNotification,
} from "../order-alerts";
const eligible = new Set([
  "restaurant",
  "cafe",
  "bakery",
  "sweets",
  "catering",
  "juice_icecream",
  "butcher",
  "grocery",
  "fruits_vegetables",
  "fish_poultry_shop",
  "pharmacy",
]);

const statusLabel: Record<FulfillmentOrder["status"], string> = {
  placed: "طلب جديد من زبون",
  quoted: "بانتظار موافقة الزبون",
  merchant_confirmed: "أكد الزبون الطلب",
  courier_assigned: "أُرسل إلى المندوب",
  courier_accepted: "قبله المندوب",
  ready_for_pickup: "جاهز للاستلام",
  picked_up: "في الطريق إلى الزبون",
  delivered: "تم التسليم والتحصيل",
  rejected: "مرفوض",
  cancelled: "ملغي",
};

export default function MerchantOrders() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [selected, setSelected] = useState("");
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [couriers, setCouriers] = useState<PublicBusinessProfile[]>([]);
  const [courierChoice, setCourierChoice] = useState<Record<string, string>>({});
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const alertsEnabledRef = useRef(false);
  const loadedOnceRef = useRef(false);
  const knownOrderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const enabled = window.localStorage.getItem("khedmah-merchant-order-alerts") === "on";
    alertsEnabledRef.current = enabled;
    setAlertsEnabled(enabled);
  }, []);
  useEffect(() => {
    void Promise.all([
      api.businesses.listMine(),
      api.businesses.search({ categoryCode: "delivery_courier" }),
    ])
      .then(([mine, available]) => {
        const list = mine.businesses.filter((b) =>
          eligible.has(b.categoryCode),
        );
        setBusinesses(list);
        setSelected(list[0]?.id ?? "");
        setCouriers(available.businesses);
      })
      .catch((c) => {
        if (
          c instanceof Error &&
          (c as Error & { statusCode?: number }).statusCode === 401
        )
          router.replace("/auth/login?next=%2Forders%2Fmerchant");
        else setError("تعذر تحميل مساحة الطلبات.");
      })
      .finally(() => setLoading(false));
  }, []);
  const announceNewOrders = useCallback((incoming: FulfillmentOrder[]) => {
    const fresh = incoming.filter(
      (order) => order.status === "placed" && !knownOrderIdsRef.current.has(order.id),
    );
    incoming.forEach((order) => knownOrderIdsRef.current.add(order.id));
    if (!loadedOnceRef.current || !fresh.length || !alertsEnabledRef.current) return;

    playOrderRing();
    showOrderNotification(
      "طلب جديد من زبون",
      fresh.length === 1
          ? `${fresh[0].items.length} أصناف بانتظار مراجعة المطعم.`
          : `${fresh.length} طلبات جديدة بانتظار مراجعة المطعم.`,
      `merchant-order-${fresh[0].id}`,
    );
  }, []);
  const load = useCallback(async (id: string) => {
    if (!id) return;
    const next = (await api.orders.merchant(id)).orders;
    announceNewOrders(next);
    setOrders(next);
    setError("");
    loadedOnceRef.current = true;
  }, [announceNewOrders]);
  useEffect(() => {
    loadedOnceRef.current = false;
    knownOrderIdsRef.current = new Set();
    if (!selected) return;
    void load(selected).catch((c) =>
      setError(c instanceof Error ? c.message : "تعذر تحميل الطلبات."),
    );
    const interval = window.setInterval(() => {
      void load(selected).catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(interval);
  }, [load, selected]);

  async function enableAlerts() {
    alertsEnabledRef.current = true;
    setAlertsEnabled(true);
    window.localStorage.setItem("khedmah-merchant-order-alerts", "on");
    playOrderRing();
    await requestOrderNotifications();
  }
  async function action(
    o: FulfillmentOrder,
    status: FulfillmentOrder["status"],
  ) {
    let data: Record<string, unknown> = {};
    if (status === "quoted") {
      const raw = window.prompt("رسوم التوصيل");
      if (raw === null) return;
      data = {
        deliveryFee: Number(raw),
        pharmacyApproved:
          o.vertical !== "pharmacy" ||
          window.confirm("أؤكد أن الصيدلي راجع الطلب ووافق على صرفه"),
      };
    }
    if (status === "courier_assigned") {
      const id = courierChoice[o.id];
      if (!id) {
        setError("اختر مندوباً معتمداً لهذا الطلب أولاً.");
        return;
      }
      data = { courierBusinessId: id };
    }
    if (status === "rejected") {
      const reason = window.prompt("سبب الرفض");
      if (!reason) return;
      data = { reason };
    }
    try {
      await api.orders.transition(o.id, status, data);
      await load(selected);
    } catch (c) {
      setError(c instanceof Error ? c.message : "تعذر تحديث الطلب.");
    }
  }
  if (loading)
    return (
      <PageShell label="طلبات المنشأة">
        <SkeletonGrid count={3} />
      </PageShell>
    );
  return (
    <PageShell label="طلبات المنشأة">
      <PageHeader
        eyebrow="مساحة المطعم والمتجر والصيدلية"
        title="طلبات العملاء"
        description="راجع الأصناف، اعرض رسوم التوصيل، ثم اختر مندوباً معتمداً."
        backHref="/business-profiles"
        actions={<ActionLink href="/store/sell">إضافة صنف</ActionLink>}
      />
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      {!businesses.length ? (
        <EmptyState
          title="لا يوجد نشاط مؤهل للطلبات"
          description="سجّل مطعماً أو نشاط أغذية أو صيدلية، ثم أضف المنتجات المنشورة."
          actions={
            <ActionLink href="/business-profiles/new">إضافة نشاط</ActionLink>
          }
        />
      ) : (
        <>
          <Surface>
            <div className="ui-form-stack">
              <label>
                النشاط
                <select
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
                  {alertsEnabled ? "رنة الطلبات مفعّلة" : "فعّل رنة الطلبات الجديدة"}
                </ActionButton>
              </div>
            </div>
          </Surface>
          {orders.length ? (
            <section className="ui-card-grid">
              {orders.map((o) => (
                <Surface as="article" key={o.id}>
                  <strong>{statusLabel[o.status]}</strong>
                  <h2>طلب نقدي</h2>
                  {o.items.map((i) => (
                    <p key={i.productListingId}>
                      {i.titleAr} × {i.quantity}
                    </p>
                  ))}
                  <p>
                    {o.customerPhone} · {o.deliveryAddress}
                  </p>
                  {o.vertical === "pharmacy" && (
                    <p>مراجعة الصيدلي: {o.pharmacyReviewStatus}</p>
                  )}
                  <div className="ui-page-actions">
                    {o.status === "placed" && (
                      <>
                        <ActionButton onClick={() => void action(o, "quoted")}>
                          مراجعة وعرض الإجمالي
                        </ActionButton>
                        <ActionButton
                          variant="secondary"
                          onClick={() => void action(o, "rejected")}
                        >
                          رفض
                        </ActionButton>
                      </>
                    )}
                    {o.status === "merchant_confirmed" && (
                      <>
                        <label>
                          المندوب المعتمد
                          <select
                            value={courierChoice[o.id] ?? ""}
                            onChange={(event) =>
                              setCourierChoice((current) => ({
                                ...current,
                                [o.id]: event.target.value,
                              }))
                            }
                          >
                            <option value="">اختر المندوب</option>
                            {couriers.map((courier) => (
                              <option key={courier.id} value={courier.id}>
                                {courier.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <ActionButton
                          onClick={() => void action(o, "courier_assigned")}
                        >
                          تعيين المندوب
                        </ActionButton>
                      </>
                    )}
                    {o.status === "courier_accepted" && (
                      <ActionButton
                        onClick={() => void action(o, "ready_for_pickup")}
                      >
                        الطلب جاهز للاستلام
                      </ActionButton>
                    )}
                  </div>
                </Surface>
              ))}
            </section>
          ) : (
            <EmptyState
              title="لا توجد طلبات"
              description="ستظهر هنا طلبات العملاء الحقيقية."
            />
          )}
        </>
      )}
    </PageShell>
  );
}
