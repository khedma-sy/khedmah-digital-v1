'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, PublicServiceListing } from '../../lib/api-client';
import { PlatformIcon, type PlatformIconName } from './platform-icon';
import { useCategories } from '../../lib/use-categories';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage } from './ui-primitives';

const PAGE_SIZE = 20;
const visualIcons: Record<string, PlatformIconName> = {
  home: 'home', food: 'food', health: 'health', education: 'education', professional: 'briefcase', beauty: 'beauty', shopping: 'cart',
  automotive: 'car', transport: 'delivery', technology: 'technology', construction: 'construction', events: 'events', agriculture: 'agriculture',
  industry: 'industry', travel: 'travel'
};
const iconFor = (visualKey?: string) => visualIcons[visualKey ?? ''] ?? 'tools';

function providerHref(service: PublicServiceListing) {
  return service.ownerType === 'business'
    ? `/business-profiles/${service.ownerId}`
    : `/professional-profiles/${service.ownerId}`;
}

export function CategoryDirectory() {
  const [services, setServices] = useState<PublicServiceListing[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const { categories, isLoading: categoriesLoading, error: categoriesError } = useCategories();
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
    if (requested && categories.length === 0) return;
    const initialCategory = categories.some(({ code }) => code === requested) ? requested : '';
    setActiveCategory(initialCategory);
    if (initialCategory) {
      void loadServices(initialCategory, requestedPage);
      return;
    }
    setServices([]);
    setTotal(0);
    setPage(1);
    setError('');
    setIsLoading(false);
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
    if (!categoryCode) {
      setServices([]);
      setTotal(0);
      setPage(1);
      setError('');
      setIsLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
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
  const specialtyTotal = categories.filter((category) => category.parentCode).length;
  const searchHref = `/search?${new URLSearchParams({ ...(activeCategory ? { categoryCode: activeCategory } : {}), type: 'all' }).toString()}`;
  const headerDescription = activeCategory
    ? 'اختر التخصص المناسب، ثم قارن مقدمي الخدمة المعتمدين وتواصل مع الأنسب لك.'
    : 'ابدأ بالمجال، انتقل إلى التخصص، ثم قارن مقدمي الخدمة المعتمدين في مكان واحد.';

  return (
    <PageShell label="دليل الخدمات" className="catalog-experience">
        <PageHeader eyebrow={activeCategory ? 'المجال المختار' : 'دليل خدمة الموحّد'} title={title} description={headerDescription} backHref={activeCategory ? '/categories' : '/'} actions={
          <><ActionLink href={searchHref}><PlatformIcon name="search" /> بحث متقدم</ActionLink>{activeCategory ? <ActionButton variant="secondary" type="button" aria-label="تغيير مجال الخدمة" aria-expanded={showFilters} aria-controls="catalog-filters" onClick={() => setShowFilters((visible) => !visible)}><PlatformIcon name="filter" /> تغيير المجال</ActionButton> : null}</>
        } />

        {showFilters ? (
          <nav id="catalog-filters" className="catalog-filters" aria-label="تصفية الخدمات">
            <button type="button" className={activeCategory === '' ? 'active' : ''} onClick={() => selectCategory('')}>كل الخدمات</button>
            {roots.map((category) => <button key={category.code} type="button" className={activeRootCode === category.code ? 'active' : ''} onClick={() => selectCategory(category.code)}>{category.nameAr}</button>)}
          </nav>
        ) : null}

        {categoriesError ? <StatusMessage tone="warning">{categoriesError}</StatusMessage> : null}
        {!activeCategory && categoriesLoading ? <SkeletonGrid count={8} label="جاري تحميل مجالات الخدمات" /> : null}

        {activeRootCode && subcategories.length > 0 ? <section className="catalog-specialties" aria-labelledby="catalog-specialties-title">
          <div className="catalog-section-heading"><div><span>اختر التخصص</span><h2 id="catalog-specialties-title">ما الخدمة التي تحتاجها؟</h2></div><button type="button" onClick={() => selectCategory(activeRootCode)}>عرض الكل</button></div>
          <div className="catalog-specialty-grid">{subcategories.map((category) => <button key={category.code} type="button" data-visual={category.visualKey} className={activeCategory === category.code ? 'active' : ''} aria-pressed={activeCategory === category.code} onClick={() => selectCategory(category.code)}><span><PlatformIcon name={iconFor(category.visualKey)} /></span><strong>{category.nameAr}</strong><small>عرض مقدمي الخدمة</small><PlatformIcon name="arrow" /></button>)}</div>
        </section> : null}

        {!activeCategory && categories.length > 0 ? (
          <section className="catalog-directory" aria-labelledby="catalog-directory-title">
            <div className="catalog-section-heading catalog-directory-heading">
              <div className="catalog-directory-intro">
                <span className="catalog-kicker"><PlatformIcon name="grid" size={16} /> مجالات خدمة</span>
                <h2 id="catalog-directory-title">اختر المجال الأقرب إلى حاجتك</h2>
                <p>ابدأ بالمجال، ثم انتقل إلى التخصص ومقدمي الخدمة المتاحين.</p>
              </div>
              <div className="catalog-directory-metrics" aria-label="ملخص دليل الخدمات">
                <span><strong>{roots.length.toLocaleString('ar-SY')}</strong><small>مجالًا</small></span>
                <span><strong>{specialtyTotal.toLocaleString('ar-SY')}</strong><small>تخصصًا</small></span>
              </div>
            </div>
            <div className="catalog-category-grid" aria-label="تصنيفات الخدمات">
              {roots.map((category) => {
                const specialtyCount = categories.filter((item) => item.parentCode === category.code).length;
                return (
                  <button key={category.code} type="button" data-visual={category.visualKey} aria-label={`${category.nameAr}، ${specialtyCount.toLocaleString('ar-SY')} تخصصات`} onClick={() => selectCategory(category.code)}>
                    <span className="catalog-category-icon"><PlatformIcon name={iconFor(category.visualKey)} size={22} /></span>
                    <span className="catalog-category-copy"><strong>{category.nameAr}</strong><small>{specialtyCount.toLocaleString('ar-SY')} تخصصات</small></span>
                    <span className="catalog-category-arrow"><PlatformIcon name="arrow" size={18} /></span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {error ? <StatusMessage tone="danger">{error} <ActionButton variant="secondary" type="button" onClick={() => void loadServices(activeCategory, page)}>إعادة المحاولة</ActionButton></StatusMessage> : null}
        {activeCategory && isLoading ? <SkeletonGrid label="جاري تحميل الخدمات" /> : null}

        {activeCategory && !isLoading && !error && services.length > 0 ? (
          <section className="catalog-results-section" aria-labelledby="catalog-results-title">
            <div className="catalog-section-heading catalog-results-heading"><div><span>نتائج معتمدة</span><h2 id="catalog-results-title">مقدمو {title}</h2></div><strong>{total.toLocaleString('ar-SY')} نتيجة</strong></div>
            <div className="catalog-results" aria-label={`${total} خدمة متاحة`}>
              {services.map((service) => (
                <article className="catalog-service" key={service.id}>
                  <span className="catalog-service-icon"><PlatformIcon name="tools" /></span>
                  <div><h2>{service.titleAr}</h2>{service.descriptionAr ? <p>{service.descriptionAr}</p> : null}<small>{service.ownerType === 'business' ? 'مقدم أعمال' : 'مهني'}</small></div>
                  <Link href={providerHref(service)} aria-label={`عرض مقدم خدمة ${service.titleAr}`}><PlatformIcon name="arrow" /></Link>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {!isLoading && !error && totalPages > 1 ? <nav className="catalog-pagination" aria-label="صفحات دليل الخدمات">
          <button type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)}>السابق</button>
          <span>الصفحة {page.toLocaleString('ar-SY')} من {totalPages.toLocaleString('ar-SY')}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>التالي</button>
        </nav> : null}

        {!isLoading && !error && services.length === 0 && activeCategory ? (
          <EmptyState icon={<PlatformIcon name="search" size={30} />} title={`لا يوجد مقدم ${title} منشور في هذا النطاق بعد`} description="الخدمة تعمل، لكن بيانات المزودين المعتمدين غير متوفرة هنا حاليًا. وسّع البحث أو اختر تخصصًا قريبًا بدل التوقف." actions={<>
            <ActionLink href={searchHref}>توسيع البحث</ActionLink>
            <ActionLink href={`/map?q=${encodeURIComponent(title)}`} variant="secondary">فتح الخريطة</ActionLink>
          </>} />
        ) : null}
    </PageShell>
  );
}
