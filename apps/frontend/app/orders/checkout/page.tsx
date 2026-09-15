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
  const createAttempt = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    let active = true;
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
          if (active) setItems(selected);
        } else if (productId) {
          const response = await api.products.get(productId);
          if (active) setItems([{ product: response.product, quantity: 1 }]);
        } else throw new Error("لم يتم اختيار أي صنف.");
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "تعذر تحميل الطلب.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [businessId, productId]);

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
    quoteGeneration.current += 1;
    setQuoteLoading(false);
    setPromoInput(value);
    setQuote(null);
    setError("");
  }

  async function applyPromo() {
    const code = promoInput.trim().toUpperCase();
    if (!businessId || !code || !items.length) return;
    const generation = ++quoteGeneration.current;
    setQuoteLoading(true);
    setError("");
    try {
      const result = await api.orders.quote({
        items: items.map((entry) => ({ productListingId: entry.product.id, quantity: entry.quantity })),
        promoCode: code,
      });
      if (generation === quoteGeneration.current) {
        setPromoInput(result.quote.promotion?.code ?? code);
        setQuote(result.quote);
      }
    } catch (cause) {
      if (generation !== quoteGeneration.current) return;
      const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
      if (status === 401) {
        router.push(`/auth/login?next=${encodeURIComponent(`/orders/checkout?businessId=${businessId}`)}`);
        return;
      }
      setQuote(null);
      setError("تعذر تطبيق كود الخصم. تحقق من الكود وشروطه ثم أعد المحاولة.");
    } finally {
      if (generation === quoteGeneration.current) setQuoteLoading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!items.length) return;
    if (prescriptionRequired && !attested) {
      setError("يجب تأكيد إقرار الوصفة قبل إرسال الطلب.");
      return;
    }
    const normalizedPromo = promoInput.trim().toUpperCase();
    if (normalizedPromo && (!quote?.promotion || quote.promotion.code !== normalizedPromo)) {
      setError("طبّق كود الخصم وراجع الإجمالي قبل إرسال الطلب.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await requestOrderNotifications();
      const payload = {
          items: items.map((entry) => ({
            productListingId: entry.product.id,
            quantity: entry.quantity,
          })),
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
      await api.orders.create(payload, createAttempt.current.key);
      if (businessId) clearRestaurantCart(businessId);
      router.push("/orders");
    } catch (cause) {
      const status =
        cause instanceof Error
          ? (cause as Error & { statusCode?: number }).statusCode
          : undefined;
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
      setSaving(false);
    }
  }

  if (loading)
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
              <input dir="ltr" autoCapitalize="characters" autoComplete="off" maxLength={32} value={promoInput} disabled={saving || quoteLoading} onChange={(event) => changePromo(event.target.value)} />
            </label>
            <ActionButton type="button" variant="secondary" disabled={saving || quoteLoading || promoInput.trim().length < 4} onClick={() => void applyPromo()}>
              {quoteLoading ? "جارٍ التحقق…" : quote?.promotion ? "إعادة التحقق" : "تطبيق الكود"}
            </ActionButton>
            <small>خصم ممول من المطعم على قيمة الأصناف فقط. رسوم التوصيل لا يشملها الخصم.</small>
          </section>}
          <label>
            رقم الهاتف
            <input
              type="tel"
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
            <ActionButton type="submit" disabled={saving}>
              {saving ? "جارٍ إرسال الطلب…" : businessId ? "إرسال الطلب للمراجعة" : "إرسال الطلب"}
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
