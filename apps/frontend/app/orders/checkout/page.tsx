"use client";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type ProductListing } from "../../../lib/api-client";
import {
  ActionButton,
  ActionLink,
  PageHeader,
  PageShell,
  SkeletonGrid,
  StatusMessage,
  Surface,
} from "../../components/ui-primitives";

export default function CheckoutPage() {
  const router = useRouter(),
    params = useSearchParams();
  const id = params.get("productId") ?? "";
  const [product, setProduct] = useState<ProductListing | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [attested, setAttested] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (id)
      void api.products
        .get(id)
        .then((r) => setProduct(r.product))
        .catch((e) =>
          setError(e instanceof Error ? e.message : "تعذر تحميل المنتج."),
        );
  }, [id]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!product) return;
    setSaving(true);
    setError("");
    try {
      await api.orders.create(
        {
          items: [{ productListingId: product.id, quantity }],
          deliveryAddress: address,
          customerPhone: phone,
          customerNote: note || undefined,
          prescriptionAttested: attested,
        },
        crypto.randomUUID(),
      );
      router.push("/orders");
    } catch (c) {
      const status =
        c instanceof Error
          ? (c as Error & { statusCode?: number }).statusCode
          : undefined;
      if (status === 401)
        return router.push(
          `/auth/login?next=${encodeURIComponent(`/orders/checkout?productId=${id}`)}`,
        );
      setError(c instanceof Error ? c.message : "تعذر إنشاء الطلب.");
    } finally {
      setSaving(false);
    }
  }
  if (!product && !error)
    return (
      <PageShell label="تأكيد الطلب">
        <SkeletonGrid count={2} />
      </PageShell>
    );
  return (
    <PageShell label="طلب نقدي">
      <PageHeader
        eyebrow="طلب وتوصيل"
        title="تأكيد الطلب"
        description="لن يُرسل المندوب قبل موافقتك على رسوم التوصيل التي تحددها المنشأة."
        backHref={id ? `/store/products/${id}` : "/store"}
      />
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      {product && (
        <Surface as="form" className="ui-form-stack" onSubmit={submit}>
          <h2>{product.titleAr}</h2>
          <p>
            {product.businessName} · {product.price.toLocaleString("ar-SY")}{" "}
            {product.currency}
          </p>
          <label>
            الكمية
            <input
              type="number"
              min="1"
              max="50"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              required
            />
          </label>
          <label>
            رقم الهاتف
            <input
              type="tel"
              dir="ltr"
              minLength={6}
              maxLength={30}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </label>
          <label>
            عنوان التسليم
            <textarea
              minLength={5}
              maxLength={300}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </label>
          <label>
            ملاحظات الطلب
            <textarea
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {product.requiresPrescription && (
            <label>
              <input
                type="checkbox"
                checked={attested}
                onChange={(e) => setAttested(e.target.checked)}
              />{" "}
              أقر بأن صرف الأدوية يخضع لمراجعة الصيدلي، وسأبرز الوصفة عند طلبها.
              لا يمكن طلب المواد المقيدة.
            </label>
          )}
          <p>
            المجموع الأولي: {(product.price * quantity).toLocaleString("ar-SY")}{" "}
            {product.currency}. الدفع نقدي، ورسوم التوصيل تُعرض عليك قبل تثبيت
            الطلب.
          </p>
          <div className="ui-page-actions">
            <ActionButton type="submit" disabled={saving}>
              {saving ? "جارٍ إرسال الطلب…" : "إرسال الطلب للمنشأة"}
            </ActionButton>
            <ActionLink
              href={`/store/products/${product.id}`}
              variant="secondary"
            >
              إلغاء
            </ActionLink>
          </div>
        </Surface>
      )}
    </PageShell>
  );
}
