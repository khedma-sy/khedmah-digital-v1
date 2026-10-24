/** In-page merchant reminder only. Browsers may throttle timers in the background;
 * durable closed-app alerting still needs a separate approved FCM/service-worker path. */
export const MERCHANT_PENDING_ORDER_ALERT_REPEAT_MS = 30_000;

export function shouldRingForMerchantOrders(
  pendingOrderIds: readonly string[],
  knownOrderIds: ReadonlySet<string>,
  lastRingAt: number | null,
  now: number,
): boolean {
  if (pendingOrderIds.length === 0) return false;
  if (pendingOrderIds.some(id => !knownOrderIds.has(id))) return true;
  return lastRingAt === null || now - lastRingAt >= MERCHANT_PENDING_ORDER_ALERT_REPEAT_MS;
}
