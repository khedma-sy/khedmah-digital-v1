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
import { CourierLocationButton } from "../courier-location-button";
export default function CourierOrders() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [selected, setSelected] = useState("");
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
  }, []);
  const load = async (id = selected) => {
    if (id) setOrders((await api.orders.courier(id)).orders);
  };
  useEffect(() => {
    void load().catch((c) =>
      setError(c instanceof Error ? c.message : "تعذر تحميل المهام."),
    );
  }, [selected]);
  async function move(o: FulfillmentOrder, status: FulfillmentOrder["status"]) {
    try {
      await api.orders.transition(
        o.id,
        status,
        status === "merchant_confirmed" ? { reason: "المندوب غير متاح" } : {},
      );
      await load();
    } catch (c) {
      setError(c instanceof Error ? c.message : "تعذر تحديث المهمة.");
    }
  }
  if (loading)
    return (
      <PageShell label="مهام المندوب">
        <SkeletonGrid count={3} />
      </PageShell>
    );
  return (
    <PageShell label="مهام المندوب">
      <PageHeader
        eyebrow="الدفع نقدي عند التسليم"
        title="مهام التوصيل"
        description="اقبل المهمة، استلم الطلب الجاهز، ثم أكد التسليم والتحصيل النقدي."
        backHref="/mobility/manage"
      />
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
          <Surface>
            <label>
              نشاط المندوب
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
                  <h2>{o.merchantName}</h2>
                  <p>التسليم إلى: {o.deliveryAddress}</p>
                  <a href={`tel:${o.customerPhone}`} dir="ltr">
                    {o.customerPhone}
                  </a>
                  {o.total !== undefined && (
                    <p>
                      تحصيل نقدي: {o.total.toLocaleString("ar-SY")} {o.currency}
                    </p>
                  )}
                  <div className="ui-page-actions">
                    {["courier_accepted", "ready_for_pickup", "picked_up"].includes(o.status) && (
                      <CourierLocationButton orderId={o.id} status={o.status} />
                    )}
                    {o.status === "courier_assigned" && (
                      <>
                        <ActionButton
                          onClick={() => void move(o, "courier_accepted")}
                        >
                          قبول المهمة
                        </ActionButton>
                        <ActionButton
                          variant="secondary"
                          onClick={() => void move(o, "merchant_confirmed")}
                        >
                          غير متاح
                        </ActionButton>
                      </>
                    )}
                    {o.status === "ready_for_pickup" && (
                      <ActionButton onClick={() => void move(o, "picked_up")}>
                        استلمت الطلب
                      </ActionButton>
                    )}
                    {o.status === "picked_up" && (
                      <ActionButton onClick={() => void move(o, "delivered")}>
                        تم التسليم وتحصيل النقد
                      </ActionButton>
                    )}
                  </div>
                </Surface>
              ))}
            </section>
          ) : (
            <EmptyState
              title="لا توجد مهام"
              description="تظهر هنا الطلبات التي تختارك المنشآت لتوصيلها."
            />
          )}
        </>
      )}
    </PageShell>
  );
}
