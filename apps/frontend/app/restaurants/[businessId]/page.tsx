"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, type ProductListing } from "../../../lib/api-client";
import {
  changeRestaurantCartItem,
  readRestaurantCart,
  writeRestaurantCart,
  type RestaurantCart,
} from "../../../lib/restaurant-cart";
import {
  ActionLink,
  EmptyState,
  PageHeader,
  PageShell,
  SkeletonGrid,
  StatusMessage,
  Surface,
} from "../../components/ui-primitives";
import { PlatformIcon } from "../../components/platform-icon";
import styles from "./menu.module.css";

const FOOD_CATEGORIES = new Set([
  "restaurant",
  "cafe",
  "bakery",
  "sweets",
  "catering",
  "juice_icecream",
]);

export default function RestaurantMenuPage() {
  const { businessId } = useParams<{ businessId: string }>();
  const [products, setProducts] = useState<ProductListing[]>([]);
  const [cart, setCart] = useState<RestaurantCart>({
    businessProfileId: businessId,
    items: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => setCart(readRestaurantCart(businessId)), [businessId]);
  useEffect(() => {
    let active = true;
    void api.products
      .list({ businessProfileId: businessId })
      .then(({ products: result }) => {
        if (!active) return;
        const menu = result.filter((product) =>
          FOOD_CATEGORIES.has(product.categoryCode),
        );
        setProducts(menu);
        if (result.length && !menu.length)
          setError("هذه المنشأة ليست ضمن فئات الطعام المفعلة للطلب.");
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "تعذر تحميل قائمة الطعام.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [businessId]);

  const selected = useMemo(
    () =>
      cart.items.flatMap((entry) => {
        const product = products.find((item) => item.id === entry.productId);
        return product ? [{ product, quantity: entry.quantity }] : [];
      }),
    [cart, products],
  );
  const total = selected.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );
  const currency = products[0]?.currency;
  const mixedCurrency = products.some(
    (product) => product.currency !== currency,
  );
  const restaurantName = products[0]?.businessName ?? "قائمة الطعام";

  function change(productId: string, amount: number) {
    const next = changeRestaurantCartItem(cart, productId, amount);
    setCart(next);
    writeRestaurantCart(next);
  }

  if (loading)
    return (
      <PageShell className={styles.page} label="قائمة الطعام">
        <SkeletonGrid count={6} />
      </PageShell>
    );
  if (error && !products.length)
    return (
      <PageShell className={styles.page} label="قائمة الطعام">
        <StatusMessage tone="danger">{error}</StatusMessage>
        <EmptyState
          icon={<PlatformIcon name="close" size={32} />}
          title="القائمة غير متاحة"
          description="يمكنك العودة واختيار مطعم آخر."
          actions={<ActionLink href="/restaurants">العودة إلى خدمة فود</ActionLink>}
        />
      </PageShell>
    );

  return (
    <PageShell className={styles.page} label={restaurantName}>
      <PageHeader
        eyebrow="خدمة فود · قائمة المطعم"
        title={restaurantName}
        description="اختر وجباتك من مطعم واحد، راجع السلة، ثم أكد الطلب والدفع نقدًا عند التسليم."
        backHref="/restaurants"
      />
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      <div className={styles.layout}>
        <section className={styles.menu} aria-label="أصناف قائمة الطعام">
          {!products.length ? (
            <EmptyState
              icon={<PlatformIcon name="search" size={32} />}
              title="لا توجد أصناف منشورة"
              description="لم ينشر المطعم أصنافًا متاحة للطلب بعد."
            />
          ) : (
            <div className={styles.grid}>
              {products.map((product) => {
                const quantity =
                  cart.items.find((item) => item.productId === product.id)
                    ?.quantity ?? 0;
                const unavailable = product.availability === "out_of_stock";
                return (
                  <Surface className={styles.item} key={product.id}>
                    <div className={styles.image}>
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.titleAr} />
                      ) : (
                        <span>خ</span>
                      )}
                    </div>
                    <h2>{product.titleAr}</h2>
                    {product.descriptionAr && (
                      <p className={styles.description}>
                        {product.descriptionAr}
                      </p>
                    )}
                    <div className={styles.itemFooter}>
                      <strong className={styles.price}>
                        {product.price.toLocaleString("ar-SY")}{" "}
                        {product.currency}
                      </strong>
                      {unavailable ? (
                        <span>غير متوفر</span>
                      ) : (
                        <div
                          className={styles.quantity}
                          aria-label={`كمية ${product.titleAr}`}
                        >
                          <button
                            type="button"
                            onClick={() => change(product.id, -1)}
                            aria-label={`إنقاص ${product.titleAr}`}
                          >
                            −
                          </button>
                          <output>{quantity}</output>
                          <button
                            type="button"
                            onClick={() => change(product.id, 1)}
                            aria-label={`إضافة ${product.titleAr}`}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </Surface>
                );
              })}
            </div>
          )}
        </section>
        <Surface as="aside" className={styles.cart} aria-label="سلة الطعام">
          <h2>سلة الطلب</h2>
          {!selected.length ? (
            <p className={styles.empty}>
              أضف وجبة أو أكثر من القائمة. لا يمكن خلط أصناف من مطاعم مختلفة في
              الطلب نفسه.
            </p>
          ) : (
            <div className={styles.cartLines}>
              {selected.map(({ product, quantity }) => (
                <div className={styles.cartLine} key={product.id}>
                  <div>
                    <strong>{product.titleAr}</strong>
                    <small>
                      {quantity} × {product.price.toLocaleString("ar-SY")}
                    </small>
                  </div>
                  <span>
                    {(quantity * product.price).toLocaleString("ar-SY")}{" "}
                    {product.currency}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className={styles.total}>
            <strong>المجموع الأولي</strong>
            <strong>
              {total.toLocaleString("ar-SY")} {currency ?? ""}
            </strong>
          </div>
          <p className={styles.cash}>
            الدفع نقدًا عند التسليم. يضيف المطعم رسوم التوصيل، ولن يُثبت الطلب
            حتى توافق عليها.
          </p>
          {mixedCurrency && (
            <StatusMessage tone="danger">
              لا يمكن جمع أصناف بعملات مختلفة. اختر أصنافًا بعملة واحدة.
            </StatusMessage>
          )}
          {selected.length && !mixedCurrency ? (
            <ActionLink
              href={`/orders/checkout?businessId=${encodeURIComponent(businessId)}`}
              variant="primary"
            >
              متابعة إلى العنوان والتأكيد
            </ActionLink>
          ) : (
            <span className={styles.empty}>
              اختر صنفًا واحدًا على الأقل للمتابعة.
            </span>
          )}
        </Surface>
      </div>
      {!!selected.length && !mixedCurrency && <ActionLink className={styles.mobileCart} href={`/orders/checkout?businessId=${encodeURIComponent(businessId)}`}><PlatformIcon name="cart" size={19}/><span>السلة · {selected.reduce((sum, item) => sum + item.quantity, 0).toLocaleString("ar-SY")}</span><strong>{total.toLocaleString("ar-SY")} {currency ?? ""}</strong></ActionLink>}
    </PageShell>
  );
}
