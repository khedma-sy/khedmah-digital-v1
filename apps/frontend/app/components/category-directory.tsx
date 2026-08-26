'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, PublicServiceListing } from '../../lib/api-client';
import { PlatformIcon } from './platform-icon';
import { useCategories } from '../../lib/use-categories';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage } from './ui-primitives';

function providerHref(service: PublicServiceListing) {
  return service.ownerType === 'business'
    ? `/business-profiles/${service.ownerId}`
    : `/professional-profiles/${service.ownerId}`;
}

export function CategoryDirectory() {
  const [services, setServices] = useState<PublicServiceListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const { categories, error: categoriesError } = useCategories();

  async function loadServices(categoryCode: string) {
    setIsLoading(true);
    setError('');
    try {
      const data = await api.services.search({ categoryCode: categoryCode || undefined });
      setServices(data.services);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل دليل الخدمات. حاول مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('category') ?? '';
    const initialCategory = categories.some(({ code }) => code === requested) ? requested : '';
    setActiveCategory(initialCategory);
    void loadServices(initialCategory);
  }, [categories]);

  function selectCategory(categoryCode: string) {
    setActiveCategory(categoryCode);
    setShowFilters(false);
    window.history.replaceState(null, '', categoryCode ? `/categories?category=${categoryCode}` : '/categories');
    void loadServices(categoryCode);
  }

  const title = categories.find(({ code }) => code === activeCategory)?.nameAr ?? 'دليل الخدمات';

  return (
    <PageShell label="دليل الخدمات" className="catalog-experience">
        <PageHeader title={title} description="اختر خدمة للاطلاع على ملف مقدمها ووسائل التواصل المتاحة." backHref="/" actions={
          <ActionButton variant="secondary" type="button" aria-label="تصفية الخدمات" aria-expanded={showFilters} aria-controls="catalog-filters" onClick={() => setShowFilters((visible) => !visible)}><PlatformIcon name="filter" /> تصفية</ActionButton>
        } />

        {showFilters ? (
          <nav id="catalog-filters" className="catalog-filters" aria-label="تصفية الخدمات">
            <button type="button" className={activeCategory === '' ? 'active' : ''} onClick={() => selectCategory('')}>كل الخدمات</button>
            {categories.map((category) => <button key={category.code} type="button" className={activeCategory === category.code ? 'active' : ''} onClick={() => selectCategory(category.code)}>{category.nameAr}</button>)}
          </nav>
        ) : null}

        {categoriesError ? <StatusMessage tone="warning">{categoriesError}</StatusMessage> : null}

        {!activeCategory && categories.length > 0 ? (
          <section className="catalog-category-grid" aria-label="تصنيفات الخدمات">
            {categories.map((category) => (
              <button key={category.code} type="button" onClick={() => selectCategory(category.code)}>
                <span className="catalog-category-icon"><PlatformIcon name="tools" /></span>
                <strong>{category.nameAr}</strong>
                <small>استعرض مقدمي الخدمة</small>
                <PlatformIcon name="arrow" />
              </button>
            ))}
          </section>
        ) : null}

        {error ? <StatusMessage tone="danger">{error} <ActionButton variant="secondary" type="button" onClick={() => void loadServices(activeCategory)}>إعادة المحاولة</ActionButton></StatusMessage> : null}
        {isLoading ? <SkeletonGrid label="جاري تحميل الخدمات" /> : null}

        {!isLoading && !error && services.length > 0 ? (
          <section className="catalog-results" aria-label={`${services.length} خدمة متاحة`}>
            {services.map((service) => (
              <article className="catalog-service" key={service.id}>
                <span className="catalog-service-icon"><PlatformIcon name="tools" /></span>
                <div><h2>{service.titleAr}</h2>{service.descriptionAr ? <p>{service.descriptionAr}</p> : null}<small>{service.ownerType === 'business' ? 'مقدم أعمال' : 'مهني'}</small></div>
                <Link href={providerHref(service)} aria-label={`عرض مقدم خدمة ${service.titleAr}`}><PlatformIcon name="arrow" /></Link>
              </article>
            ))}
          </section>
        ) : null}

        {!isLoading && !error && services.length === 0 && activeCategory ? (
          <EmptyState icon={<PlatformIcon name="search" size={30} />} title="لا توجد نتائج في هذا التصنيف بعد" description="اختر تصنيفاً آخر، أو ابحث عبر الخريطة، أو أضف نشاطك ليظهر للعملاء." actions={<>
            <ActionButton variant="secondary" type="button" onClick={() => selectCategory('')}>تغيير التصنيف</ActionButton>
            <ActionLink href="/map">فتح الخريطة</ActionLink>
            <ActionLink href="/business-profiles/new" variant="secondary">إضافة نشاط</ActionLink>
          </>} />
        ) : null}
    </PageShell>
  );
}
