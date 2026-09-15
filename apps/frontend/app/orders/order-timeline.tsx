import type {
  FulfillmentOrderEvent,
  FulfillmentOrderStatus,
} from "../../lib/recovered-service-client";
import styles from "./order-timeline.module.css";

const labels: Record<FulfillmentOrderStatus, string> = {
  placed: "تم إنشاء الطلب",
  quoted: "أرسل المطعم الإجمالي",
  merchant_confirmed: "وافق العميل على الإجمالي",
  courier_assigned: "أُسند الطلب إلى مندوب",
  courier_accepted: "قبل المندوب المهمة",
  ready_for_pickup: "الطلب جاهز للاستلام",
  picked_up: "استلم المندوب الطلب",
  delivered: "تم التسليم والتحصيل",
  rejected: "رفض المطعم الطلب",
  cancelled: "أُلغي الطلب",
};

const formatter = new Intl.DateTimeFormat("ar-SY-u-nu-latn", {
  dateStyle: "medium",
  timeStyle: "short",
});

function eventLabel(event: FulfillmentOrderEvent) {
  if (
    event.toStatus === "merchant_confirmed" &&
    ["courier_assigned", "courier_accepted", "ready_for_pickup"].includes(
      event.fromStatus ?? "",
    )
  )
    return "أُعيد الطلب لاختيار مندوب آخر";
  return labels[event.toStatus];
}

export function OrderTimeline({
  events = [],
}: {
  readonly events?: readonly FulfillmentOrderEvent[];
}) {
  if (!events.length) return null;
  return (
    <details className={styles.timeline}>
      <summary>رحلة الطلب ({events.length.toLocaleString("ar-SY-u-nu-latn")})</summary>
      <ol>
        {events.map((event) => (
          <li key={event.id}>
            <span aria-hidden="true" />
            <div>
              <strong>{eventLabel(event)}</strong>
              <time dateTime={event.occurredAt}>
                {formatter.format(new Date(event.occurredAt))}
              </time>
              {event.reason ? <p>السبب: {event.reason}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
