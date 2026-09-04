"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type ProductListing } from "../../../lib/api-client";
import {
  clearRestaurantCart,
  readRestaurantCart,
} from "../../../lib/restaurant-cart";
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
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!items.length) return;
    if (prescriptionRequired && !attested) {
      setError("يجب تأكيد إقرار الوصفة قبل إرسال الطلب.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await requestOrderNotifications();
      await api.orders.create(
        {
          items: items.map((entry) => ({
            productListingId: entry.product.id,
            quantity: entry.quantity,
          })),
          deliveryAddress: address,
          customerPhone: phone,
          customerNote: note || undefined,
          prescriptionAttested: attested,
        },
        crypto.randomUUID(),
      );
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
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء الطلب.");
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <PageShell label="تأكيد الطلب">
        <SkeletonGrid count={2} />
      </PageShell>
    );
  return (
    <PageShell label="طلب نقدي">
      <PageHeader
        eyebrow="طلب وتوصيل"
        title="العنوان وتأكيد الطلب"
        description="راجع الأصناف وأدخل بيانات التسليم. الدفع نقدًا، ورسوم التوصيل تُعرض عليك قبل تثبيت الطلب."
        backHref={backHref}
      />
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      {!!items.length && (
        <Surface as="form" className="ui-form-stack" onSubmit={submit}>
          <section aria-label="ملخص الأصناف">
            <h2>{items[0]?.product.businessName}</h2>
            {items.map(({ product, quantity }) => (
              <p key={product.id}>
                {product.titleAr} · {quantity} ×{" "}
                {product.price.toLocaleString("ar-SY")} {product.currency}
              </p>
            ))}
            <strong>
              المجموع الأولي: {subtotal.toLocaleString("ar-SY")} {currency}
            </strong>
          </section>
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
          <p>
            الدفع نقدًا عند التسليم. يحدد المطعم رسوم التوصيل، ويمكنك قبولها أو
            إلغاء الطلب قبل تعيين المندوب.
          </p>
          <div className="ui-page-actions">
            <ActionButton type="submit" disabled={saving}>
              {saving ? "جارٍ إرسال الطلب…" : "إرسال الطلب للمطعم"}
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
