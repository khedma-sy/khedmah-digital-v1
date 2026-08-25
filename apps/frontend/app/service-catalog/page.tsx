'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, PublicServiceListing } from '../../lib/api-client';
import { PlatformIcon } from '../components/platform-icon';
import { useCategories } from '../../lib/use-categories';

function providerHref(service: PublicServiceListing) {
  return service.ownerType === 'business'
    ? `/business-profiles/${service.ownerId}`
    : `/professional-profiles/${service.ownerId}`;
}

export default function ServiceCatalogPage() {
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
    window.history.replaceState(null, '', categoryCode ? `/service-catalog?category=${categoryCode}` : '/service-catalog');
    void loadServices(categoryCode);
  }

  const title = categories.find(({ code }) => code === activeCategory)?.nameAr ?? 'دليل الخدمات';

  return (
    <main id="foundation-content" className="catalog-experience" aria-label="دليل الخدمات">
      <div className="catalog-phone">
        <header className="catalog-header">
          <Link href="/" aria-label="العودة إلى الرئيسية"><PlatformIcon name="arrow" /></Link>
          <h1>{title}</h1>
          <button type="button" aria-label="تصفية الخدمات" aria-expanded={showFilters} aria-controls="catalog-filters" onClick={() => setShowFilters((visible) => !visible)}><PlatformIcon name="filter" /></button>
        </header>

        {showFilters ? (
          <nav id="catalog-filters" className="catalog-filters" aria-label="تصفية الخدمات">
            <button type="button" className={activeCategory === '' ? 'active' : ''} onClick={() => selectCategory('')}>كل الخدمات</button>
            {categories.map((category) => <button key={category.code} type="button" className={activeCategory === category.code ? 'active' : ''} onClick={() => selectCategory(category.code)}>{category.nameAr}</button>)}
          </nav>
        ) : null}

        <p className="catalog-intro">اختر خدمة للاطلاع على ملف مقدمها ووسائل التواصل المتاحة.</p>
        {categoriesError ? <p className="form-error" role="status">{categoriesError}</p> : null}

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

        {error ? <div className="catalog-state" role="alert"><p>{error}</p><button type="button" onClick={() => void loadServices(activeCategory)}>إعادة المحاولة</button></div> : null}
        {isLoading ? <div className="catalog-results" aria-busy="true" aria-label="جاري تحميل الخدمات">{Array.from({ length: 4 }, (_, index) => <div className="catalog-skeleton" key={index} />)}</div> : null}

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
          <div className="catalog-state">
            <PlatformIcon name="search" size={30} />
            <h2>لا توجد نتائج في هذا التصنيف بعد</h2>
            <p>اختر تصنيفاً آخر، أو ابحث عبر الخريطة، أو أضف نشاطك ليظهر للعملاء.</p>
            <div className="catalog-state-actions">
              <button type="button" onClick={() => selectCategory('')}>تغيير التصنيف</button>
              <Link href="/map">فتح الخريطة</Link>
              <Link href="/business-profiles/new">إضافة نشاط</Link>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
