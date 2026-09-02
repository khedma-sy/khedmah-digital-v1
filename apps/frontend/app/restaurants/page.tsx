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
      <PageShell label="المطاعم">
        <SkeletonGrid count={6} />
      </PageShell>
    );
  return (
    <PageShell label="طلب الطعام">
      <PageHeader
        eyebrow="مطاعم وأغذية"
        title="ماذا تريد أن تطلب؟"
        description="اختر مطعمًا، أضف عدة أصناف إلى السلة، ثم ادفع نقدًا عند التسليم."
        backHref="/"
      />
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      <Surface className={styles.toolbar}>
        <label className={styles.field}>
          <span>ابحث عن مطعم أو نوع طعام</span>
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
        <span className={styles.count} role="status" aria-live="polite">
          {visible.length.toLocaleString("ar-SY")} مطعمًا ونشاطًا غذائيًا
        </span>
        <div className={styles.filters} aria-label="أنواع الطعام">
          {FOOD_FILTERS.map((filter) => <button key={filter.code || "all"} type="button" onClick={() => setCategory(filter.code)} aria-pressed={category === filter.code}>{filter.label}</button>)}
        </div>
      </Surface>
      {!visible.length ? (
        <EmptyState
          icon={<PlatformIcon name="search" size={32} />}
          title="لا توجد مطاعم مطابقة"
          description={businesses.length ? "امسح المرشحات أو اختر نوعًا آخر من الطعام." : "لم تُنشر قوائم طعام معتمدة في منطقتك بعد. يمكنك استكشاف الأنشطة أو تسجيل مطعمك."}
          actions={<>{(query || category) ? <ActionButton type="button" variant="secondary" onClick={resetFilters}><PlatformIcon name="refresh" size={18}/>مسح المرشحات</ActionButton> : null}<ActionLink href="/search?categoryCode=restaurant" variant="secondary">استكشف الأنشطة</ActionLink><ActionLink href="/business-profiles/new">سجّل مطعمك</ActionLink></>}
        />
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
                <PlatformIcon name="cart" size={18}/>عرض قائمة الطعام
              </ActionLink>
            </Surface>
          ))}
        </div>
      )}
    </PageShell>
  );
}
