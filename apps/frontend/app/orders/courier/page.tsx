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
import { PlatformIcon } from "../../components/platform-icon";
import { CourierLocationButton } from "../courier-location-button";
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
      />
      <details className={styles.guide} id="courier-guide">
        <summary>
          <span className={styles.guideIcon}><PlatformIcon name="info" size={21} /></span>
          <span><strong>شرح مهام مندوب التوصيل</strong><small>افتح الدليل قبل قبول أول مهمة</small></span>
          <PlatformIcon name="arrow" size={18} />
        </summary>
        <div className={styles.guideBody}>
          <ol>
            <li><span>١</span><div><strong>راجع المهمة</strong><p>تحقق من اسم المنشأة وعنوان العميل وقيمة المبلغ النقدي المطلوب تحصيله.</p></div></li>
            <li><span>٢</span><div><strong>اقبل أو اعتذر</strong><p>اقبل المهمة فقط عندما تستطيع تنفيذها، أو اختر «غير متاح» لتعود إلى المنشأة.</p></div></li>
            <li><span>٣</span><div><strong>شارك موقعك</strong><p>ابدأ مشاركة الموقع بعد القبول وأبقها فعّالة أثناء الاستلام والتوصيل ليتمكن العميل من المتابعة.</p></div></li>
            <li><span>٤</span><div><strong>ثبّت الاستلام</strong><p>اضغط «استلمت الطلب» بعد استلامه فعليًا من المنشأة.</p></div></li>
            <li><span>٥</span><div><strong>سلّم وحصّل النقد</strong><p>لا تؤكد التسليم إلا بعد تسليم الطلب للعميل وتحصيل المبلغ الظاهر في المهمة.</p></div></li>
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
          </Surface>
          {orders.length ? (
            <section className={styles.orderGrid} aria-label="مهام التوصيل الحالية">
              {orders.map((o) => (
                <Surface as="article" className={styles.orderCard} key={o.id}>
                  <span className={styles.status}><PlatformIcon name="delivery" size={16}/>{statusLabel[o.status]}</span>
                  <h2>{o.merchantName}</h2>
                  <dl className={styles.orderDetails}>
                    <div><dt><PlatformIcon name="pin" size={17}/>عنوان التسليم</dt><dd>{o.deliveryAddress}</dd></div>
                    <div><dt><PlatformIcon name="phone" size={17}/>رقم العميل</dt><dd><a href={`tel:${o.customerPhone}`} dir="ltr">{o.customerPhone}</a></dd></div>
                    {o.total !== undefined && <div><dt><PlatformIcon name="check" size={17}/>التحصيل النقدي</dt><dd>{o.total.toLocaleString("ar-SY")} {o.currency}</dd></div>}
                  </dl>
                  <div className={styles.orderActions}>
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
