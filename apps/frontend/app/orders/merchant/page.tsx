"use client";
import { useEffect, useState } from "react";
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
export default function MerchantOrders() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [selected, setSelected] = useState("");
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [couriers, setCouriers] = useState<PublicBusinessProfile[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
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
  const load = async (id = selected) => {
    if (id) setOrders((await api.orders.merchant(id)).orders);
  };
  useEffect(() => {
    void load().catch((c) =>
      setError(c instanceof Error ? c.message : "تعذر تحميل الطلبات."),
    );
  }, [selected]);
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
      const id = window.prompt(
        `أدخل رقم المندوب:\n${couriers.map((c) => `${c.id} — ${c.name}`).join("\n")}`,
      );
      if (!id) return;
      data = { courierBusinessId: id };
    }
    if (status === "rejected") {
      const reason = window.prompt("سبب الرفض");
      if (!reason) return;
      data = { reason };
    }
    try {
      await api.orders.transition(o.id, status, data);
      await load();
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
          </Surface>
          {orders.length ? (
            <section className="ui-card-grid">
              {orders.map((o) => (
                <Surface as="article" key={o.id}>
                  <strong>{o.status}</strong>
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
                      <ActionButton
                        onClick={() => void action(o, "courier_assigned")}
                      >
                        اختيار مندوب
                      </ActionButton>
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
