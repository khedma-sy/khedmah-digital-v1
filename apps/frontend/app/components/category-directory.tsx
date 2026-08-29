'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, PublicServiceListing } from '../../lib/api-client';
import { PlatformIcon } from './platform-icon';
import { useCategories } from '../../lib/use-categories';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage } from './ui-primitives';

const PAGE_SIZE = 20;

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
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const { categories, error: categoriesError } = useCategories();
  const roots = categories.filter((category) => !category.parentCode);

  async function loadServices(categoryCode: string, pageNumber = 1) {
    setPage(pageNumber);
    setIsLoading(true);
    setError('');
    try {
      const data = await api.services.search({ categoryCode: categoryCode || undefined, page: pageNumber });
      setServices(data.services);
      setPage(data.page);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل دليل الخدمات. حاول مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('category') ?? '';
    const requestedPage = Math.max(1, Number(new URLSearchParams(window.location.search).get('page')) || 1);
    const initialCategory = categories.some(({ code }) => code === requested) ? requested : '';
    setActiveCategory(initialCategory);
    void loadServices(initialCategory, requestedPage);
  }, [categories]);

  function syncUrl(categoryCode: string, pageNumber: number) {
    const params = new URLSearchParams();
    if (categoryCode) params.set('category', categoryCode);
    if (pageNumber > 1) params.set('page', String(pageNumber));
    window.history.replaceState(null, '', params.size ? `/categories?${params}` : '/categories');
  }

  function selectCategory(categoryCode: string) {
    setActiveCategory(categoryCode);
    setShowFilters(false);
    syncUrl(categoryCode, 1);
    void loadServices(categoryCode, 1);
  }

  function goToPage(pageNumber: number) {
    syncUrl(activeCategory, pageNumber);
    void loadServices(activeCategory, pageNumber);
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
          <ActionButton variant="secondary" type="button" aria-label="تصفية الخدمات" aria-expanded={showFilters} aria-controls="catalog-filters" onClick={() => setShowFilters((visible) => !visible)}><PlatformIcon name="filter" /> تصفية</ActionButton>
        } />

        {showFilters ? (
          <nav id="catalog-filters" className="catalog-filters" aria-label="تصفية الخدمات">
            <button type="button" className={activeCategory === '' ? 'active' : ''} onClick={() => selectCategory('')}>كل الخدمات</button>
            {roots.map((category) => <button key={category.code} type="button" className={activeRootCode === category.code ? 'active' : ''} onClick={() => selectCategory(category.code)}>{category.nameAr}</button>)}
          </nav>
        ) : null}

        {categoriesError ? <StatusMessage tone="warning">{categoriesError}</StatusMessage> : null}

        {activeRootCode && subcategories.length > 0 ? <nav className="catalog-filters" aria-label="التخصصات الفرعية">
          <button type="button" className={activeCategory === activeRootCode ? 'active' : ''} onClick={() => selectCategory(activeRootCode)}>كل {categories.find((category) => category.code === activeRootCode)?.nameAr}</button>
          {subcategories.map((category) => <button key={category.code} type="button" className={activeCategory === category.code ? 'active' : ''} onClick={() => selectCategory(category.code)}>{category.nameAr}</button>)}
        </nav> : null}

        {!activeCategory && categories.length > 0 ? (
          <section className="catalog-category-grid" aria-label="تصنيفات الخدمات">
            {roots.map((category) => (
              <button key={category.code} type="button" onClick={() => selectCategory(category.code)}>
                <span className="catalog-category-icon"><PlatformIcon name="tools" /></span>
                <strong>{category.nameAr}</strong>
                <small>{categories.filter((item) => item.parentCode === category.code).length.toLocaleString('ar-SY')} تخصصات</small>
                <PlatformIcon name="arrow" />
              </button>
            ))}
          </section>
        ) : null}

        {error ? <StatusMessage tone="danger">{error} <ActionButton variant="secondary" type="button" onClick={() => void loadServices(activeCategory, page)}>إعادة المحاولة</ActionButton></StatusMessage> : null}
        {isLoading ? <SkeletonGrid label="جاري تحميل الخدمات" /> : null}

        {!isLoading && !error && services.length > 0 ? (
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

        {!isLoading && !error && totalPages > 1 ? <nav className="catalog-pagination" aria-label="صفحات دليل الخدمات">
          <button type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)}>السابق</button>
          <span>الصفحة {page.toLocaleString('ar-SY')} من {totalPages.toLocaleString('ar-SY')}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>التالي</button>
        </nav> : null}

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
