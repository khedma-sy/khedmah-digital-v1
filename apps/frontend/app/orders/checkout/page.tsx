"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type FoodOrderQuote, type ProductListing } from "../../../lib/recovered-service-client";
import {
  clearRestaurantCart,
  readRestaurantCart,
} from "../../../lib/restaurant-cart";
import { DeliveryHelp } from "../../components/delivery-help";
import {
  ActionButton,
  ActionLink,
  PageHeader,
  PageShell,
  SkeletonGrid,
  StatusMessage,
  Surface,
} from "../../components/ui-primitives";
import { requestOrderNotifications } from "../order-alerts";
import styles from "./checkout.module.css";

interface CheckoutItem {
  readonly product: ProductListing;
  readonly quantity: number;
}

type OrderDraft = Parameters<typeof api.orders.create>[0];
interface CheckoutRequest {
  readonly key: string;
  readonly data: OrderDraft;
  readonly quote: FoodOrderQuote | null;
  readonly expiresAt: number;
}
interface CheckoutJourney {
  active: boolean;
  inFlight: boolean;
  completed: boolean;
  recoveryBlocked: boolean;
  request?: CheckoutRequest;
}

interface StoredCheckoutAttempt {
  readonly version: 1;
  readonly scope: string;
  readonly request: CheckoutRequest;
}

const CHECKOUT_ATTEMPT_PREFIX = "khedmah:checkout-attempt:v1:";
const CHECKOUT_ATTEMPT_TTL_MS = 30 * 60 * 1000;

function attemptStorageKey(scope: string) {
  return `${CHECKOUT_ATTEMPT_PREFIX}${scope}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOrderDraft(value: unknown): value is OrderDraft {
  if (!isRecord(value) || !Array.isArray(value.items)) return false;
  if (
    typeof value.deliveryAddress !== "string" ||
    typeof value.customerPhone !== "string" ||
    typeof value.prescriptionAttested !== "boolean"
  ) return false;
  if (value.customerNote !== undefined && typeof value.customerNote !== "string") return false;
  if (value.promoCode !== undefined && typeof value.promoCode !== "string") return false;
  if (value.expectedSubtotal !== undefined && typeof value.expectedSubtotal !== "number") return false;
  if (value.expectedDiscountAmount !== undefined && typeof value.expectedDiscountAmount !== "number") return false;
  return value.items.length > 0 && value.items.every((item) =>
    isRecord(item) &&
    typeof item.productListingId === "string" &&
    Number.isInteger(item.quantity) &&
    Number(item.quantity) > 0
  );
}

function isFoodOrderQuote(value: unknown): value is FoodOrderQuote {
  if (!isRecord(value)) return false;
  if (
    typeof value.merchantBusinessId !== "string" ||
    !["food", "grocery", "pharmacy"].includes(String(value.vertical)) ||
    !["SYP", "USD"].includes(String(value.currency)) ||
    typeof value.subtotal !== "number" ||
    typeof value.discountAmount !== "number" ||
    typeof value.discountedSubtotal !== "number"
  ) return false;
  return value.promotion === undefined || (
    isRecord(value.promotion) &&
    typeof value.promotion.code === "string" &&
    typeof value.promotion.nameAr === "string"
  );
}

function readStoredAttempt(scope: string): { state: "none" | "invalid" } | { state: "ready"; attempt: StoredCheckoutAttempt } {
  if (typeof sessionStorage === "undefined") return { state: "none" };
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(attemptStorageKey(scope));
  } catch {
    return { state: "none" };
  }
  if (!raw) return { state: "none" };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { state: "invalid" };
  }
  if (!isRecord(value) || value.version !== 1 || value.scope !== scope || !isRecord(value.request))
    return { state: "invalid" };
  const request = value.request;
  if (
    typeof request.key !== "string" || !request.key ||
    typeof request.expiresAt !== "number" || !Number.isFinite(request.expiresAt) ||
    !isOrderDraft(request.data) ||
    !(request.quote === null || isFoodOrderQuote(request.quote))
  ) return { state: "invalid" };
  if (request.expiresAt <= Date.now()) {
    try { sessionStorage.removeItem(attemptStorageKey(scope)); } catch { /* Optional recovery storage. */ }
    return { state: "none" };
  }
  return { state: "ready", attempt: value as unknown as StoredCheckoutAttempt };
}

function persistStoredAttempt(scope: string, request: CheckoutRequest) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(attemptStorageKey(scope), JSON.stringify({ version: 1, scope, request } satisfies StoredCheckoutAttempt));
  } catch { /* In-page idempotency recovery remains available. */ }
}

function clearStoredAttempt(scope: string) {
  if (typeof sessionStorage === "undefined") return;
  try { sessionStorage.removeItem(attemptStorageKey(scope)); } catch { /* Optional recovery storage. */ }
}

function basketMatches(items: readonly CheckoutItem[], draft: OrderDraft) {
  if (items.length !== draft.items.length) return false;
  const current = items
    .map((entry) => `${entry.product.id}:${entry.quantity}`)
    .sort();
  const stored = draft.items
    .map((entry) => `${entry.productListingId}:${entry.quantity}`)
    .sort();
  return current.every((value, index) => value === stored[index]);
}

function quoteMatchesDraft(quote: FoodOrderQuote | null, draft: OrderDraft) {
  if (!draft.promoCode)
    return quote === null || quote.promotion === undefined;
  return quote?.promotion?.code === draft.promoCode &&
    quote.subtotal === draft.expectedSubtotal &&
    quote.discountAmount === draft.expectedDiscountAmount;
}

export default function CheckoutPage() {
  const router = useRouter();
  const params = useSearchParams();
  const productId = params.get("productId") ?? "";
  const businessId = params.get("businessId") ?? "";
  const [items, setItems] = useState<CheckoutItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [attested, setAttested] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [quote, setQuote] = useState<FoodOrderQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const quoteGeneration = useRef(0);
  const quoteInFlight = useRef(false);
  const createAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const scope = `${businessId}:${productId}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [loadedScope, setLoadedScope] = useState("");
  const journey = useRef<CheckoutJourney>({ active: false, inFlight: false, completed: false, recoveryBlocked: false });

  useEffect(() => {
    let active = true;
    const current: CheckoutJourney = { active: true, inFlight: false, completed: false, recoveryBlocked: false };
    journey.current = current;
    setLoading(true);
    setItems([]);
    setError("");
    setPhone("");
    setAddress("");
    setNote("");
    setAttested(false);
    quoteGeneration.current += 1;
    quoteInFlight.current = false;
    setPromoInput("");
    setQuote(null);
    setQuoteLoading(false);
    createAttempt.current = null;
    setSaving(false);
    setUncertain(false);
    setRecoveryBlocked(false);
    function restoreAttempt(selected: CheckoutItem[]) {
      const recovery = readStoredAttempt(scope);
      if (recovery.state === "none") return;
      if (recovery.state !== "ready") {
        current.recoveryBlocked = true;
        setRecoveryBlocked(true);
        setError("توجد محاولة طلب محفوظة لا تطابق السلة الحالية. راجع طلباتك قبل بدء محاولة جديدة.");
        return;
      }
      const recovered = recovery.attempt.request;
      if (!basketMatches(selected, recovered.data) || !quoteMatchesDraft(recovered.quote, recovered.data)) {
        current.recoveryBlocked = true;
        setRecoveryBlocked(true);
        setError("توجد محاولة طلب محفوظة لا تطابق السلة الحالية. راجع طلباتك قبل بدء محاولة جديدة.");
        return;
      }
      current.request = recovered;
      createAttempt.current = { fingerprint: JSON.stringify(recovered.data), key: recovered.key };
      setPhone(recovered.data.customerPhone);
      setAddress(recovered.data.deliveryAddress);
      setNote(recovered.data.customerNote ?? "");
      setAttested(recovered.data.prescriptionAttested);
      setPromoInput(recovered.data.promoCode ?? "");
      setQuote(recovered.quote);
      setUncertain(true);
    }
    async function load() {
      try {
        if (businessId) {
          const cart = readRestaurantCart(businessId);
          if (!cart.items.length)
            throw new Error("السلة فارغة. اختر أصنافًا من قائمة المطعم أولًا.");
          const response = await api.products.list({
            businessProfileId: businessId,
          });
          const selected = cart.items.flatMap((entry) => {
            const product = response.products.find(
              (candidate) =>
                candidate.id === entry.productId &&
                candidate.availability !== "out_of_stock",
            );
            return product ? [{ product, quantity: entry.quantity }] : [];
          });
          if (selected.length !== cart.items.length)
            throw new Error(
              "تغير توفر أحد الأصناف. ارجع إلى القائمة وراجع السلة.",
            );
          if (
            selected.some(
              (entry) => entry.product.businessProfileId !== businessId,
            )
          )
            throw new Error("لا يمكن خلط أصناف من مطاعم مختلفة.");
          if (
            selected.some(
              (entry) =>
                entry.product.currency !== selected[0]?.product.currency,
            )
          )
            throw new Error("لا يمكن طلب أصناف بعملات مختلفة.");
          if (active) {
            setItems(selected);
            restoreAttempt(selected);
          }
        } else if (productId) {
          const response = await api.products.get(productId);
          if (response.product.availability === "out_of_stock")
            throw new Error("هذا الصنف غير متوفر حاليًا. اختر صنفًا آخر.");
          if (active) {
            const selected = [{ product: response.product, quantity: 1 }];
            setItems(selected);
            restoreAttempt(selected);
          }
        } else throw new Error("لم يتم اختيار أي صنف.");
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "تعذر تحميل الطلب.",
          );
      } finally {
        if (active) {
          setLoadedScope(scope);
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
      current.active = false;
      quoteGeneration.current += 1;
      quoteInFlight.current = false;
    };
  }, [businessId, productId, scope]);

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, entry) => sum + entry.product.price * entry.quantity,
        0,
      ),
    [items],
  );
  const currency = items[0]?.product.currency;
  const prescriptionRequired = items.some(
    (entry) => entry.product.requiresPrescription,
  );
  const backHref = businessId
    ? `/restaurants/${businessId}`
    : productId
      ? `/store/products/${productId}`
      : "/store";

  function changePromo(value: string) {
    const current = journey.current;
    if (!current.active || current.inFlight || current.request || quoteInFlight.current) return;
    quoteGeneration.current += 1;
    setPromoInput(value);
    setQuote(null);
    setError("");
  }

  async function applyPromo() {
    const current = journey.current;
    const requestScope = scope;
    const code = promoInput.trim().toUpperCase();
    if (
      !businessId || !code || !items.length ||
      !current.active || current.inFlight || current.request ||
      current.recoveryBlocked || quoteInFlight.current || currentScope.current !== requestScope
    ) return;
    const generation = ++quoteGeneration.current;
    quoteInFlight.current = true;
    setQuoteLoading(true);
    setQuote(null);
    setError("");
    try {
      const result = await api.orders.quote({
        items: items.map((entry) => ({ productListingId: entry.product.id, quantity: entry.quantity })),
        promoCode: code,
      });
      if (generation === quoteGeneration.current && current.active && currentScope.current === requestScope) {
        setPromoInput(result.quote.promotion?.code ?? code);
        setQuote(result.quote);
        setError("");
      }
    } catch (cause) {
      if (generation !== quoteGeneration.current || !current.active || currentScope.current !== requestScope) return;
      const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
      if (status === 401) {
        router.push(`/auth/login?next=${encodeURIComponent(`/orders/checkout?businessId=${businessId}`)}`);
        return;
      }
      setQuote(null);
      setError("تعذر تطبيق كود الخصم. تحقق من الكود وشروطه ثم أعد المحاولة.");
    } finally {
      if (generation === quoteGeneration.current && current.active && currentScope.current === requestScope) {
        quoteInFlight.current = false;
        setQuoteLoading(false);
      }
    }
  }

  function discardRecoveredAttempt() {
    const current = journey.current;
    if (!current.active || current.inFlight) return;
    clearStoredAttempt(scope);
    current.request = undefined;
    current.recoveryBlocked = false;
    createAttempt.current = null;
    setUncertain(false);
    setRecoveryBlocked(false);
    setPromoInput("");
    setQuote(null);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const current = journey.current;
    if (!current.active || current.inFlight || current.completed || loading || loadedScope !== scope || currentScope.current !== scope || !items.length) return;
    if (current.recoveryBlocked) {
      setError("راجع طلباتك أولًا، ثم أكد بدء محاولة جديدة.");
      return;
    }
    const replaying = Boolean(current.request);
    if (!replaying && quoteInFlight.current) {
      setError("انتظر اكتمال التحقق من كود الخصم قبل إرسال الطلب.");
      return;
    }
    if (!replaying && prescriptionRequired && !attested) {
      setError("يجب تأكيد إقرار الوصفة قبل إرسال الطلب.");
      return;
    }
    const normalizedPromo = promoInput.trim().toUpperCase();
    if (!replaying && normalizedPromo && (!quote?.promotion || quote.promotion.code !== normalizedPromo)) {
      setError("طبّق كود الخصم وراجع الإجمالي قبل إرسال الطلب.");
      return;
    }
    current.inFlight = true;
    const payload: OrderDraft = current.request?.data ?? {
        items: items.map((entry) => ({ productListingId: entry.product.id, quantity: entry.quantity })),
        deliveryAddress: address,
        customerPhone: phone,
        customerNote: note || undefined,
        prescriptionAttested: attested,
        promoCode: quote?.promotion?.code,
        expectedSubtotal: quote?.promotion ? quote.subtotal : undefined,
        expectedDiscountAmount: quote?.promotion ? quote.discountAmount : undefined,
    };
    const fingerprint = JSON.stringify(payload);
    if (!createAttempt.current || createAttempt.current.fingerprint !== fingerprint)
      createAttempt.current = { fingerprint, key: crypto.randomUUID() };
    current.request ??= {
      key: createAttempt.current.key,
      data: payload,
      quote,
      expiresAt: Date.now() + CHECKOUT_ATTEMPT_TTL_MS,
    };
    persistStoredAttempt(scope, current.request);
    setSaving(true);
    setError("");
    try {
      // Optional notifications must not delay or prevent order submission.
      void requestOrderNotifications().catch(() => undefined);
      const result = await api.orders.create(payload, createAttempt.current.key);
      if (!result?.order?.id) throw new Error("لم يصل تأكيد الطلب. أعد المحاولة لاستعادته.");
      current.completed = true;
      clearStoredAttempt(scope);
      if (!current.active || currentScope.current !== scope) return;
      // A storage error after a successful POST is not an order failure.
      try { if (businessId) clearRestaurantCart(businessId); } catch { /* Continue to the saved order. */ }
      router.push("/orders");
    } catch (cause) {
      const status =
        cause instanceof Error
          ? (cause as Error & { statusCode?: number }).statusCode
          : undefined;
      const definitiveFailure = status !== undefined && status >= 400 && status < 500 &&
        status !== 408 && status !== 429 && !(replaying && (status === 401 || status === 403));
      if (definitiveFailure) clearStoredAttempt(scope);
      if (!current.active || currentScope.current !== scope) return;
      if (definitiveFailure) {
        current.request = undefined;
        createAttempt.current = null;
        setUncertain(false);
      } else {
        // Preserve both the key and the exact payload until this request is resolved.
        setUncertain(true);
      }
      if (status === 401)
        return router.push(
          `/auth/login?next=${encodeURIComponent(`/orders/checkout?${businessId ? `businessId=${businessId}` : `productId=${productId}`}`)}`,
        );
      if (status === 409 && quote?.promotion) {
        setQuote(null);
        setError("تغيّر السعر أو لم يعد كود الخصم متاحًا. طبّق الكود مجددًا وراجع الإجمالي.");
        return;
      }
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء الطلب.");
    } finally {
      current.inFlight = false;
      if (current.active && currentScope.current === scope) setSaving(false);
    }
  }

  if (loading || loadedScope !== scope)
    return (
      <PageShell className={styles.page} label="تأكيد الطلب">
        <SkeletonGrid count={2} />
      </PageShell>
    );
  return (
    <PageShell className={businessId ? styles.page : undefined} label="طلب نقدي">
      <PageHeader
        eyebrow={businessId ? "خدمة فود · إتمام الطلب" : "طلب وتوصيل"}
        title={businessId ? "أين نوصّل طلبك؟" : "العنوان وتأكيد الطلب"}
        description="أدخل بيانات التسليم وراجع الأصناف. سيراجع مقدم الطلب ورسوم التوصيل قبل تثبيته."
        backHref={backHref}
      />
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      {uncertain && <StatusMessage>لم يصل تأكيد الطلب بعد. أعد المحاولة بنفس البيانات لاستعادة النتيجة دون تكرار الطلب، أو راجع <ActionLink href="/orders">طلباتي</ActionLink> قبل بدء طلب جديد.</StatusMessage>}
      {recoveryBlocked && <StatusMessage tone="danger">لا يمكن استعادة المحاولة لأن أصنافها لا تطابق السلة الحالية. افتح <ActionLink href="/orders">طلباتي</ActionLink> وتأكد من النتيجة، ثم ابدأ طلبًا جديدًا بقرار صريح.</StatusMessage>}
      {(uncertain || recoveryBlocked) && <div className="ui-page-actions">
        <ActionLink href="/orders" variant="secondary">مراجعة طلباتي</ActionLink>
        <ActionButton type="button" variant="secondary" onClick={discardRecoveredAttempt}>راجعت طلباتي، بدء طلب جديد</ActionButton>
      </div>}
      {!!items.length && <DeliveryHelp mode="order" />}
      {!!items.length && (
        <Surface as="form" className={`${styles.checkout} ui-form-stack`} onSubmit={submit}>
          <section className={styles.summary} aria-label="ملخص الأصناف">
            <h2>{items[0]?.product.businessName}</h2>
            {items.map(({ product, quantity }) => (
              <p key={product.id}>
                {product.titleAr} · {quantity} ×{" "}
                {product.price.toLocaleString("ar-SY-u-nu-latn")} {product.currency}
              </p>
            ))}
            <strong>المجموع الأولي: {(quote?.subtotal ?? subtotal).toLocaleString("ar-SY-u-nu-latn")} {currency}</strong>
            {quote?.promotion && <div className={styles.discount} role="status">
              <span>{quote.promotion.nameAr} · <bdi>{quote.promotion.code}</bdi></span>
              <span>الخصم: -{quote.discountAmount.toLocaleString("ar-SY-u-nu-latn")} {currency}</span>
              <strong>بعد الخصم: {quote.discountedSubtotal.toLocaleString("ar-SY-u-nu-latn")} {currency}</strong>
            </div>}
          </section>
          {businessId && <section className={styles.promo} aria-label="كود خصم المطعم">
            <label>كود الخصم
              <input name="promoCode" dir="ltr" autoCapitalize="characters" autoComplete="off" maxLength={32} value={promoInput} disabled={saving || quoteLoading || uncertain || recoveryBlocked} onChange={(event) => changePromo(event.target.value)} />
            </label>
            <ActionButton type="button" variant="secondary" disabled={saving || quoteLoading || uncertain || recoveryBlocked || promoInput.trim().length < 4} onClick={() => void applyPromo()}>
              {quoteLoading ? "جارٍ التحقق…" : quote?.promotion ? "إعادة التحقق" : "تطبيق الكود"}
            </ActionButton>
            <small>خصم ممول من المطعم على قيمة الأصناف فقط. رسوم التوصيل لا يشملها الخصم.</small>
          </section>}
          <label>
            رقم الهاتف
            <input
              type="tel"
              name="phone"
              disabled={saving || uncertain || recoveryBlocked}
              dir="ltr"
              minLength={6}
              maxLength={30}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              required
            />
          </label>
          <label>
            عنوان التسليم
            <textarea
              name="address"
              disabled={saving || uncertain || recoveryBlocked}
              minLength={5}
              maxLength={300}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              autoComplete="street-address"
              required
            />
          </label>
          <label>
            ملاحظات الطلب
            <textarea
              name="note"
              disabled={saving || uncertain || recoveryBlocked}
              maxLength={500}
              placeholder="مثال: بدون بصل، الاتصال عند الوصول"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {prescriptionRequired && (
            <label>
              <input
                type="checkbox"
                disabled={saving || uncertain || recoveryBlocked}
                checked={attested}
                onChange={(event) => setAttested(event.target.checked)}
                required
              />{" "}
              أقر بأن صرف الأدوية يخضع لمراجعة الصيدلي، وسأبرز الوصفة عند طلبها.
              لا يمكن طلب المواد المقيدة.
            </label>
          )}
          <p className={styles.payment}>
            الدفع نقدًا عند التسليم. يراجع مقدم الطلب رسوم التوصيل، ولن يثبت الطلب
            أو يُعيّن المندوب قبل موافقتك على الإجمالي.
          </p>
          <div className="ui-page-actions">
            <ActionButton type="submit" disabled={saving || quoteLoading || recoveryBlocked}>
              {saving ? "جارٍ إرسال الطلب…" : uncertain ? "إعادة المحاولة واستعادة الطلب" : businessId ? "إرسال الطلب للمراجعة" : "إرسال الطلب"}
            </ActionButton>
            <ActionLink href={backHref} variant="secondary">
              العودة إلى السلة
            </ActionLink>
          </div>
        </Surface>
      )}
    </PageShell>
  );
}
