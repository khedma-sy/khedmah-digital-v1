'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, PublicServiceListing } from '../../lib/api-client';
import { mapHref } from '../../lib/map-context';
import { PlatformIcon } from './platform-icon';
import { useCategories } from '../../lib/use-categories';
import { categoryDirectoryHref, discoveryContextKey, readDiscoveryContext } from '../../lib/discovery-context';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage } from './ui-primitives';

const PAGE_SIZE = 20;

function providerHref(service: PublicServiceListing) {
  return service.ownerType === 'business'
    ? `/business-profiles/${service.ownerId}`
    : `/professional-profiles/${service.ownerId}`;
}

export function CategoryDirectory() {
  const params = useSearchParams();
  const router = useRouter();
  const context = readDiscoveryContext(params);
  const { q, cityCode, categoryCode: activeCategory, page } = context;
  const contextKey = discoveryContextKey(context);
  const [services, setServices] = useState<PublicServiceListing[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const { categories, isLoading: categoriesLoading, error: categoriesError, retry: retryCategories } = useCategories();
  const requestSequence = useRef(0);
  const [settledCategories, setSettledCategories] = useState<typeof categories | null>(null);
  const [settledContextKey, setSettledContextKey] = useState<string | null>(null);
  const filtersUnavailable = categoriesLoading || !!categoriesError;
  const invalidCategory = !filtersUnavailable && !!activeCategory
    && !categories.some(({ code }) => code === activeCategory);
  // A new registry can render before its effect starts the matching service request.
  // Keep that transition busy instead of briefly exposing stale results as ready.
  const isLoading = categoriesLoading || (!categoriesError && !invalidCategory
    && (servicesLoading || settledCategories !== categories || settledContextKey !== contextKey));
  const roots = categories.filter((category) => !category.parentCode);

  const loadServices = useCallback(async (categoryCode: string, pageNumber = 1) => {
    if (categoriesLoading || categoriesError) return;
    const requestId = ++requestSequence.current;
    setServicesLoading(true);
    setError('');
    try {
      const data = await api.services.search({
        categoryCode: categoryCode || undefined, cityCode: cityCode || undefined,
        q: q || undefined, page: pageNumber
      });
      if (requestId !== requestSequence.current) return;
      setServices(data.services);
      setTotal(data.total);
    } catch (err) {
      if (requestId === requestSequence.current) setError(err instanceof Error ? err.message : 'تعذر تحميل دليل الخدمات. حاول مرة أخرى.');
    } finally {
      if (requestId === requestSequence.current) {
        setSettledCategories(categories);
        setSettledContextKey(contextKey);
        setServicesLoading(false);
      }
    }
  }, [categories, categoriesLoading, categoriesError, q, cityCode, contextKey]);

  useEffect(() => {
    if (filtersUnavailable || invalidCategory) return;
    // URL is the request owner: actions only navigate; this effect issues the query.
    void loadServices(activeCategory, page);
    return () => { requestSequence.current += 1; };
  }, [filtersUnavailable, invalidCategory, activeCategory, page, loadServices]);

  function syncUrl(categoryCode: string, pageNumber: number) {
    const href = categoryDirectoryHref(params, categoryCode, pageNumber);
    const next = readDiscoveryContext(new URLSearchParams(href.split('?')[1] ?? ''));
    const currentHref = params.size ? `/categories?${params}` : '/categories';
    if (href === currentHref) return;
    if (discoveryContextKey(next) === contextKey) {
      // Alias-only normalization must not create a duplicate history entry or fetch.
      router.replace(href, { scroll: false });
      return;
    }
    // A previous completion must not publish while a newer navigation is pending.
    requestSequence.current += 1;
    setServicesLoading(true);
    router.push(href, { scroll: false });
  }

  function selectCategory(categoryCode: string) {
    if (filtersUnavailable) return;
    setShowFilters(false);
    syncUrl(categoryCode, 1);
  }

  function goToPage(pageNumber: number) {
    if (filtersUnavailable || invalidCategory) return;
    syncUrl(activeCategory, pageNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const title = categories.find(({ code }) => code === activeCategory)?.nameAr ?? 'دليل الخدمات';
  const active = categories.find(({ code }) => code === activeCategory);
  const activeRootCode = active?.parentCode ?? active?.code;
  const subcategories = activeRootCode
    ? categories.filter((category) => category.parentCode === activeRootCode)
    : [];
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <PageShell label="دليل الخدمات" className="catalog-experience">
        <PageHeader title={title} description="اختر خدمة للاطلاع على ملف مقدمها ووسائل التواصل المتاحة." backHref="/" actions={
          <ActionButton variant="secondary" type="button" disabled={filtersUnavailable} aria-label="تصفية الخدمات" aria-expanded={showFilters} aria-controls="catalog-filters" onClick={() => setShowFilters((visible) => !visible)}><PlatformIcon name="filter" /> تصفية</ActionButton>
        } />

        {showFilters ? (
          <nav id="catalog-filters" className="catalog-filters" aria-label="تصفية الخدمات">
            <button type="button" disabled={filtersUnavailable} className={activeCategory === '' ? 'active' : ''} onClick={() => selectCategory('')}>كل الخدمات</button>
            {roots.map((category) => <button key={category.code} type="button" disabled={filtersUnavailable} className={activeRootCode === category.code ? 'active' : ''} onClick={() => selectCategory(category.code)}>{category.nameAr}</button>)}
          </nav>
        ) : null}

        {invalidCategory ? <StatusMessage tone="warning">التصنيف المحدد غير متاح. اختر تصنيفاً آخر بدلاً من عرض نتائج غير مطابقة. <ActionButton variant="secondary" type="button" onClick={() => selectCategory('')}>عرض كل التصنيفات</ActionButton></StatusMessage> : null}

        {categoriesError ? <StatusMessage tone="warning">{categoriesError} <ActionButton variant="secondary" type="button" onClick={() => void retryCategories()}>إعادة تحميل التصنيفات</ActionButton></StatusMessage> : null}

        {activeRootCode && subcategories.length > 0 ? <nav className="catalog-filters" aria-label="التخصصات الفرعية">
          <button type="button" disabled={filtersUnavailable} className={activeCategory === activeRootCode ? 'active' : ''} onClick={() => selectCategory(activeRootCode)}>كل {categories.find((category) => category.code === activeRootCode)?.nameAr}</button>
          {subcategories.map((category) => <button key={category.code} type="button" disabled={filtersUnavailable} className={activeCategory === category.code ? 'active' : ''} onClick={() => selectCategory(category.code)}>{category.nameAr}</button>)}
        </nav> : null}

        {!activeCategory && categories.length > 0 ? (
          <section className="catalog-category-grid" aria-label="تصنيفات الخدمات">
            {roots.map((category) => (
              <button key={category.code} type="button" disabled={filtersUnavailable} onClick={() => selectCategory(category.code)}>
                <span className="catalog-category-icon"><PlatformIcon name="tools" /></span>
                <strong>{category.nameAr}</strong>
                <small>{categories.filter((item) => item.parentCode === category.code).length.toLocaleString('ar-SY')} تخصصات</small>
                <PlatformIcon name="arrow" />
              </button>
            ))}
          </section>
        ) : null}

        {error && !filtersUnavailable && !invalidCategory && settledContextKey === contextKey ? <StatusMessage tone="danger">{error} <ActionButton variant="secondary" type="button" onClick={() => void loadServices(activeCategory, page)}>إعادة المحاولة</ActionButton></StatusMessage> : null}
        {isLoading ? <SkeletonGrid label="جاري تحميل الخدمات" /> : null}

        {!isLoading && !categoriesError && !invalidCategory && !error && services.length > 0 ? (
          <section className="catalog-results" aria-label={`${total} خدمة متاحة`}>
            {services.map((service) => (
              <article className="catalog-service" key={service.id}>
                <span className="catalog-service-icon"><PlatformIcon name="tools" /></span>
                <div><h2>{service.titleAr}</h2>{service.descriptionAr ? <p>{service.descriptionAr}</p> : null}<small>{service.ownerType === 'business' ? 'مقدم أعمال' : 'مهني'}</small></div>
                <Link href={providerHref(service)} aria-label={`عرض مقدم خدمة ${service.titleAr}`}><PlatformIcon name="arrow" /></Link>
              </article>
            ))}
          </section>
        ) : null}

        {!isLoading && !categoriesError && !invalidCategory && !error && totalPages > 1 ? <nav className="catalog-pagination" aria-label="صفحات دليل الخدمات">
          <button type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)}>السابق</button>
          <span>الصفحة {page.toLocaleString('ar-SY')} من {totalPages.toLocaleString('ar-SY')}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>التالي</button>
        </nav> : null}

        {!isLoading && !categoriesError && !invalidCategory && !error && services.length === 0 && activeCategory ? (
          <EmptyState icon={<PlatformIcon name="search" size={30} />} title="لا توجد نتائج في هذا التصنيف بعد" description="اختر تصنيفاً آخر، أو ابحث عبر الخريطة، أو أضف نشاطك ليظهر للعملاء." actions={<>
            <ActionButton variant="secondary" type="button" onClick={() => selectCategory('')}>تغيير التصنيف</ActionButton>
            <ActionLink href={mapHref(context)}>فتح الخريطة</ActionLink>
            <ActionLink href="/business-profiles/new" variant="secondary">إضافة نشاط</ActionLink>
          </>} />
        ) : null}
    </PageShell>
  );
}
