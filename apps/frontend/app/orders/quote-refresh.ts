export type QuoteRefreshResult = "updated" | "incomplete" | "failed" | "superseded";

type QuoteSnapshot = {
  id: string;
  status: string;
  total?: number;
  updatedAt?: string;
  currency?: string;
};

/** Only unblock a visible quoted order after its own usable quote is refreshed. */
export function pendingQuoteIds(blocked: ReadonlySet<string>, orders: readonly QuoteSnapshot[]): Set<string> {
  const byId = new Map(orders.map((order) => [order.id, order]));
  return new Set([...blocked].filter((id) => {
    const order = byId.get(id);
    if (!order || order.status !== "quoted") return false;
    return typeof order.total !== "number" || !Number.isFinite(order.total) ||
      typeof order.updatedAt !== "string" || !Number.isFinite(Date.parse(order.updatedAt)) ||
      (order.currency !== "SYP" && order.currency !== "USD");
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
