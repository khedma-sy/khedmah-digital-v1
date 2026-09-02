"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type PublicBusinessProfile } from "../../lib/api-client";
import {
  ActionLink,
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

export default function RestaurantsPage() {
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [query, setQuery] = useState("");
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
    if (!normalized) return businesses;
    return businesses.filter((business) =>
      `${business.name} ${business.descriptionAr ?? ""} ${business.categoryNameAr ?? ""}`
        .toLocaleLowerCase("ar")
        .includes(normalized),
    );
  }, [businesses, query]);

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
          ابحث عن مطعم أو نوع طعام
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="مثال: شاورما، حلويات، مخبز"
          />
        </label>
        <span>
          {visible.length.toLocaleString("ar-SY")} مطعمًا ونشاطًا غذائيًا
        </span>
      </Surface>
      {!visible.length ? (
        <EmptyState
          icon={<PlatformIcon name="search" size={32} />}
          title="لا توجد مطاعم مطابقة"
          description="غيّر البحث أو عد لاحقًا بعد نشر قوائم الطعام."
        />
      ) : (
        <div className={styles.grid}>
          {visible.map((business) => (
            <Surface as="article" className={styles.card} key={business.id}>
              <h2>{business.name}</h2>
              <div className={styles.meta}>
                <span>{business.categoryNameAr ?? "مطعم وأغذية"}</span>
                <span>·</span>
                <span>{business.cityCode}</span>
                {business.isFeatured && <span>· مميز</span>}
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
                عرض قائمة الطعام
              </ActionLink>
            </Surface>
          ))}
        </div>
      )}
    </PageShell>
  );
}
