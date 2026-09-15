"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { api, type PublicBusinessProfile } from "../../lib/recovered-service-client";
import {
  ActionLink,
  ActionButton,
  EmptyState,
  PageHeader,
  PageShell,
  SkeletonGrid,
  StatusMessage,
  Surface,
} from "../components/ui-primitives";
import { PlatformIcon } from "../components/platform-icon";
import styles from "./restaurants.module.css";

const FOOD_CATEGORIES = [
  "restaurant",
  "cafe",
  "bakery",
  "sweets",
  "catering",
  "juice_icecream",
] as const;

const FOOD_FILTERS = [
  { code: "", label: "الكل" },
  { code: "restaurant", label: "مطاعم" },
  { code: "cafe", label: "مقاهٍ" },
  { code: "bakery", label: "مخابز" },
  { code: "sweets", label: "حلويات" },
  { code: "juice_icecream", label: "عصائر وبوظة" },
];

function mergeBusinesses(current: PublicBusinessProfile[], incoming: PublicBusinessProfile[]) {
  const unique = new Map<string, PublicBusinessProfile>();
  for (const business of [...current, ...incoming]) unique.set(business.id, business);
  return [...unique.values()].sort(
    (a, b) => Number(b.isFeatured) - Number(a.isFeatured) || a.name.localeCompare(b.name, "ar"),
  );
}

export default function RestaurantsPage() {
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [partialFailure, setPartialFailure] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  useEffect(() => {
    let active = true;
    const selectedCategories = category ? [category] : [...FOOD_CATEGORIES];
    if (page === 1) setLoading(true); else setLoadingMore(true);
    setError("");

    void Promise.allSettled(
      selectedCategories.map((categoryCode) => api.businesses.search({
        q: deferredQuery || undefined,
        categoryCode,
        page,
      })),
    ).then((responses) => {
      if (!active) return;
      const fulfilled = responses.filter((response): response is PromiseFulfilledResult<Awaited<ReturnType<typeof api.businesses.search>>> => response.status === "fulfilled");
      const rejected = responses.filter((response) => response.status === "rejected");
      if (!fulfilled.length) {
        const firstFailure = rejected[0]?.reason;
        setError(firstFailure instanceof Error ? firstFailure.message : "تعذر تحميل المطاعم.");
        setPartialFailure(true);
        if (page === 1) { setBusinesses([]); setTotal(0); }
        return;
      }

      const incoming = fulfilled.flatMap((response) => response.value.businesses);
      const fulfilledTotal = fulfilled.reduce((sum, response) => sum + response.value.total, 0);
      setBusinesses((current) => page === 1 ? mergeBusinesses([], incoming) : mergeBusinesses(current, incoming));
      if (!rejected.length) setTotal(fulfilledTotal);
      else if (page === 1) setTotal(fulfilledTotal);
      setPartialFailure(rejected.length > 0);
      setError("");
      setWarning(rejected.length ? "تم تحميل نتائج جزئية. أعد محاولة الصفحة الحالية قبل متابعة بقية المطاعم." : "");
    }).finally(() => {
      if (!active) return;
      setLoading(false);
      setLoadingMore(false);
    });
    return () => { active = false; };
  }, [category, deferredQuery, page, retryToken]);

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
    setPartialFailure(false);
  }

  function updateCategory(value: string) {
    setCategory(value);
    setPage(1);
    setPartialFailure(false);
  }

  function resetFilters() {
    setQuery("");
    setCategory("");
    setPage(1);
    setPartialFailure(false);
  }

  const hasMore = !partialFailure && businesses.length < total;

  if (loading && page === 1)
    return (
      <PageShell className={styles.page} label="المطاعم">
        <SkeletonGrid count={6} />
      </PageShell>
    );
  return (
    <PageShell className={styles.page} label="طلب الطعام">
      <PageHeader
        eyebrow="خدمة فود · طلب الطعام"
        title="اطلب وجبتك بسهولة"
        description="ابحث عن مطعم أو طبق، اختر أصنافك، ثم تابع الطلب حتى بابك."
        backHref="/food"
        actions={<ActionLink href="/orders" variant="secondary"><PlatformIcon name="cart" size={17}/>طلباتي</ActionLink>}
      />
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      {warning && <StatusMessage tone="warning">{warning}</StatusMessage>}
      <Surface className={styles.foodCommand}>
        <div className={styles.toolbarHeading}><span data-khedma-icon-surface className={styles.toolbarIcon}><PlatformIcon name="food" size={24}/></span><div><h2>ماذا تشتهي اليوم؟</h2><p>كل المطاعم والأصناف المتاحة في مكان واحد.</p></div></div>
        <label className={styles.field}>
          <span className={styles.visuallyHidden}>اسم المطعم أو الطبق</span>
          <span className={styles.searchControl}>
            <PlatformIcon name="search" size={20} />
            <input
              type="search"
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              placeholder="مثال: شاورما، حلويات، مخبز"
            />
          </span>
        </label>
        <div className={styles.filters} aria-label="أنواع الطعام">
          {FOOD_FILTERS.map((filter) => <button key={filter.code || "all"} type="button" onClick={() => updateCategory(filter.code)} aria-pressed={category === filter.code}>{filter.label}</button>)}
        </div>
        <ol className={styles.journeySteps} aria-label="مراحل طلب الطعام">
          <li><span>1</span><div><strong>اختر المطعم</strong><small>تصفح القائمة والأسعار</small></div></li>
          <li><span>2</span><div><strong>راجع السلة</strong><small>حدد العنوان والملاحظات</small></div></li>
          <li><span>3</span><div><strong>تابع الطلب</strong><small>حتى وصول المندوب</small></div></li>
        </ol>
      </Surface>
      <section className={styles.results} aria-labelledby="restaurant-results-title">
        <div className={styles.resultsHeading}><div><span>أنشطة معتمدة</span><h2 id="restaurant-results-title">المطاعم المتاحة</h2></div><p role="status" aria-live="polite">{businesses.length.toLocaleString("ar-SY-u-nu-latn")} من {total.toLocaleString("ar-SY-u-nu-latn")} مطعمًا ونشاطًا غذائيًا</p></div>
      {!businesses.length ? (
        <div className={styles.emptyWrap}>
        <EmptyState
          icon={<PlatformIcon name="search" size={32} />}
          title="لا توجد مطاعم مطابقة"
          description={(query || category) ? "امسح المرشحات أو اختر نوعًا آخر من الطعام." : "لم تُنشر قوائم طعام معتمدة في منطقتك بعد. يمكنك استكشاف الأنشطة أو تسجيل مطعمك."}
          actions={<>{(query || category) ? <ActionButton type="button" onClick={resetFilters}><PlatformIcon name="refresh" size={18}/>مسح المرشحات</ActionButton> : null}<ActionLink href="/search?categoryCode=restaurant" variant="secondary">استكشف أنشطة قريبة</ActionLink></>}
        /></div>
      ) : (
        <>
          <div className={styles.grid}>
            {businesses.map((business) => (
              <Surface as="article" className={styles.card} key={business.id}>
                <h2>{business.name}</h2>
                <div className={styles.meta}>
                  <span><PlatformIcon name="food" size={15}/>{business.categoryNameAr ?? "مطعم وأغذية"}</span>
                  <span><PlatformIcon name="pin" size={15}/>{business.cityCode}</span>
                  {business.isFeatured && <span><PlatformIcon name="sparkles" size={15}/>مميز</span>}
                </div>
                {business.descriptionAr && <p className={styles.description}>{business.descriptionAr}</p>}
                {business.rating !== undefined && business.ratingCount !== 0 && (
                  <span className={styles.rating}>★ {business.rating.toLocaleString("ar-SY-u-nu-latn")} ({(business.ratingCount ?? 0).toLocaleString("ar-SY-u-nu-latn")} تقييم)</span>
                )}
                <ActionLink href={`/restaurants/${business.id}`}><PlatformIcon name="cart" size={18}/>ابدأ الطلب</ActionLink>
              </Surface>
            ))}
          </div>
          <div className={styles.paginationActions}>
            {partialFailure
              ? <ActionButton type="button" variant="secondary" onClick={() => setRetryToken((token) => token + 1)} disabled={loadingMore}><PlatformIcon name="refresh" size={18}/>{loadingMore ? "جارٍ إعادة المحاولة…" : "إعادة تحميل الصفحة الحالية"}</ActionButton>
              : hasMore
                ? <ActionButton type="button" variant="secondary" onClick={() => setPage((current) => current + 1)} disabled={loadingMore}>{loadingMore ? "جارٍ تحميل المزيد…" : "تحميل المزيد من المطاعم"}</ActionButton>
                : null}
          </div>
        </>
      )}
      </section>
      <div className={styles.professionalLink}><ActionLink href="/orders/courier" variant="quiet"><PlatformIcon name="delivery" size={17}/>هل تعمل مندوبًا؟ افتح بوابة التوصيل</ActionLink><ActionLink href="/business-profiles/new" variant="quiet"><PlatformIcon name="storefront" size={17}/>سجّل مطعمك</ActionLink></div>
    </PageShell>
  );
}
