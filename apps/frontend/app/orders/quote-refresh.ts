export type QuoteRefreshResult = "updated" | "incomplete" | "failed" | "superseded";

type QuoteSnapshot = {
  id: string;
  status: string;
  total?: number;
  updatedAt?: string;
  currency?: string;
};

// Keep the confirmation boundary aligned with the NUMERIC(14,2) server
// validator, including its tolerance for normal floating-point arithmetic.
function isSupportedCashTotal(value: number): boolean {
  if (!Number.isFinite(value) || value < 0) return false;
  const decimal = /^(0|[1-9]\d{0,11})(?:\.(\d{1,2}))?$/.exec(String(value).trim());
  const maximumCents = 99_999_999_999_999n;
  if (decimal) {
    const cents = BigInt(decimal[1]) * 100n + BigInt((decimal[2] ?? "").padEnd(2, "0"));
    return cents <= maximumCents;
  }
  const scaled = value * 100;
  const cents = Math.round(scaled);
  return Number.isSafeInteger(cents) && Math.abs(scaled - cents) <= 1e-7 &&
    cents >= 0 && BigInt(cents) <= maximumCents;
}

/** Match the date/currency boundaries expected by the confirmation API. */
export function isReviewableQuote(order: QuoteSnapshot): boolean {
  if (order.status !== "quoted" || typeof order.total !== "number" ||
      !isSupportedCashTotal(order.total) ||
      typeof order.updatedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(order.updatedAt) ||
      (order.currency !== "SYP" && order.currency !== "USD")) return false;
  const timestamp = Date.parse(order.updatedAt);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === order.updatedAt;
}

/** Only unblock a visible quoted order after its own usable quote is refreshed. */
export function pendingQuoteIds(blocked: ReadonlySet<string>, orders: readonly QuoteSnapshot[]): Set<string> {
  const byId = new Map(orders.map((order) => [order.id, order]));
  return new Set([...blocked].filter((id) => {
    const order = byId.get(id);
    if (!order || order.status !== "quoted") return false;
    return !isReviewableQuote(order);
  }));
}

export function quoteRefreshMessage(result: Exclude<QuoteRefreshResult, "superseded">): string {
  if (result === "updated") return "تم تحديث بيانات الطلب. راجع الإجمالي قبل الموافقة.";
  if (result === "incomplete") return "الإجمالي غير متاح بعد. انتظر اكتمال بيانات الطلب قبل الموافقة.";
  return "تعذر تحديث بيانات الطلب. تحقّق من الاتصال وانتظر التحديث قبل الموافقة.";
}

/** Refresh a stale quote without implying that a failed reload succeeded. */
export async function reloadQuoteForReview(actions: {
  markStale: () => void;
  refresh: () => Promise<QuoteRefreshResult>;
  showStatus: (message: string) => void;
}): Promise<void> {
  actions.markStale();
  let result: QuoteRefreshResult = "failed";
  try {
    result = await actions.refresh();
  } catch {
    // A refresh failure must leave the old quote blocked.
  }
  // A newer load owns both the gate and the message. An older response must
  // never overwrite its result, even if the newer load already succeeded.
  if (result !== "superseded") actions.showStatus(quoteRefreshMessage(result));
}
