"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type PublicBusinessProfile } from "../../lib/api-client";
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
];

const FOOD_FILTERS = [
  { code: "", label: "الكل" },
  { code: "restaurant", label: "مطاعم" },
  { code: "cafe", label: "مقاهٍ" },
  { code: "bakery", label: "مخابز" },
  { code: "sweets", label: "حلويات" },
  { code: "juice_icecream", label: "عصائر وبوظة" },
];

export default function RestaurantsPage() {
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all(
      FOOD_CATEGORIES.map((categoryCode) =>
        api.businesses.search({ categoryCode }),
      ),
    )
      .then((responses) => {
        if (!active) return;
        const unique = new Map<string, PublicBusinessProfile>();
        for (const response of responses)
          for (const business of response.businesses)
            unique.set(business.id, business);
        setBusinesses(
          [...unique.values()].sort(
            (a, b) =>
              Number(b.isFeatured) - Number(a.isFeatured) ||
              a.name.localeCompare(b.name, "ar"),
          ),
        );
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "تعذر تحميل المطاعم.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ar");
    return businesses.filter((business) =>
      (!category || business.categoryCode === category) &&
      (!normalized || `${business.name} ${business.descriptionAr ?? ""} ${business.categoryNameAr ?? ""}`
        .toLocaleLowerCase("ar")
        .includes(normalized)),
    );
  }, [businesses, category, query]);

  function resetFilters() {
    setQuery("");
    setCategory("");
  }

  if (loading)
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
        backHref="/"
        actions={<ActionLink href="/orders" variant="secondary"><PlatformIcon name="cart" size={17}/>طلباتي</ActionLink>}
      />
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      <Surface className={styles.foodCommand}>
        <div className={styles.toolbarHeading}><span className={styles.toolbarIcon}><PlatformIcon name="food" size={24}/></span><div><h2>ماذا تشتهي اليوم؟</h2><p>كل المطاعم والأصناف المتاحة في مكان واحد.</p></div></div>
        <label className={styles.field}>
          <span className={styles.visuallyHidden}>اسم المطعم أو الطبق</span>
          <span className={styles.searchControl}>
            <PlatformIcon name="search" size={20} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="مثال: شاورما، حلويات، مخبز"
            />
          </span>
        </label>
        <div className={styles.filters} aria-label="أنواع الطعام">
          {FOOD_FILTERS.map((filter) => <button key={filter.code || "all"} type="button" onClick={() => setCategory(filter.code)} aria-pressed={category === filter.code}>{filter.label}</button>)}
        </div>
        <ol className={styles.journeySteps} aria-label="مراحل طلب الطعام">
          <li><span>١</span><div><strong>اختر المطعم</strong><small>تصفح القائمة والأسعار</small></div></li>
          <li><span>٢</span><div><strong>راجع السلة</strong><small>حدد العنوان والملاحظات</small></div></li>
          <li><span>٣</span><div><strong>تابع الطلب</strong><small>حتى وصول المندوب</small></div></li>
        </ol>
      </Surface>
      <section className={styles.results} aria-labelledby="restaurant-results-title">
        <div className={styles.resultsHeading}><div><span>أنشطة معتمدة</span><h2 id="restaurant-results-title">المطاعم المتاحة</h2></div><p role="status" aria-live="polite">{visible.length.toLocaleString("ar-SY")} مطعمًا ونشاطًا غذائيًا</p></div>
      {!visible.length ? (
        <div className={styles.emptyWrap}>
        <EmptyState
          icon={<PlatformIcon name="search" size={32} />}
          title="لا توجد مطاعم مطابقة"
          description={businesses.length ? "امسح المرشحات أو اختر نوعًا آخر من الطعام." : "لم تُنشر قوائم طعام معتمدة في منطقتك بعد. يمكنك استكشاف الأنشطة أو تسجيل مطعمك."}
          actions={<>{(query || category) ? <ActionButton type="button" onClick={resetFilters}><PlatformIcon name="refresh" size={18}/>مسح المرشحات</ActionButton> : null}<ActionLink href="/search?categoryCode=restaurant" variant="secondary">استكشف أنشطة قريبة</ActionLink></>}
        /></div>
      ) : (
        <div className={styles.grid}>
          {visible.map((business) => (
            <Surface as="article" className={styles.card} key={business.id}>
              <h2>{business.name}</h2>
              <div className={styles.meta}>
                <span><PlatformIcon name="food" size={15}/>{business.categoryNameAr ?? "مطعم وأغذية"}</span>
                <span><PlatformIcon name="pin" size={15}/>{business.cityCode}</span>
                {business.isFeatured && <span><PlatformIcon name="sparkles" size={15}/>مميز</span>}
              </div>
              {business.descriptionAr && (
                <p className={styles.description}>{business.descriptionAr}</p>
              )}
              {business.rating !== undefined && business.ratingCount !== 0 && (
                <span className={styles.rating}>
                  ★ {business.rating.toLocaleString("ar-SY")} (
                  {(business.ratingCount ?? 0).toLocaleString("ar-SY")} تقييم)
                </span>
              )}
              <ActionLink href={`/restaurants/${business.id}`}>
                <PlatformIcon name="cart" size={18}/>ابدأ الطلب
              </ActionLink>
            </Surface>
          ))}
        </div>
      )}
      </section>
      <div className={styles.professionalLink}><ActionLink href="/orders/courier" variant="quiet"><PlatformIcon name="delivery" size={17}/>هل تعمل مندوبًا؟ افتح بوابة التوصيل</ActionLink><ActionLink href="/business-profiles/new" variant="quiet"><PlatformIcon name="storefront" size={17}/>سجّل مطعمك</ActionLink></div>
    </PageShell>
  );
}
