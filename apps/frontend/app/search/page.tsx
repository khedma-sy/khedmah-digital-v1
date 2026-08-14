'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, PublicBusinessProfile, PublicProfessionalProfile, PublicServiceListing } from '../../lib/api-client';
import { canonicalCityCode, cityLabel, useSyrianCities } from '../../lib/use-syrian-cities';
import { useCategories } from '../../lib/use-categories';
import { PlatformIcon } from '../components/platform-icon';



function trustLabel(status: string) {
  if (status === 'approved') return <span className="badge badge-approved"><PlatformIcon name="check" size={14} /> معتمد</span>;
  if (status === 'suspended') return <span className="badge badge-suspended"><PlatformIcon name="close" size={14} /> موقوف</span>;
  return <span className="badge badge-pending">قيد المراجعة</span>;
}

function availLabel(av: string) {
  if (av === 'available') return <span className="badge badge-available">متاح</span>;
  if (av === 'busy') return <span className="badge badge-busy">مشغول</span>;
  return <span className="badge badge-unavailable">غير متاح</span>;
}

function priceLabel(type: string) {
  if (type === 'fixed') return 'سعر ثابت';
  if (type === 'hourly') return 'بالساعة';
  return 'قابل للتفاوض';
}

type TabType = 'all' | 'business' | 'professional' | 'service';

function SearchContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { cities, isLoading: citiesLoading, error: citiesError, retry: retryCities } = useSyrianCities();
  const { categories, isLoading: categoriesLoading, error: categoriesError } = useCategories();

  const [q, setQ] = useState(params.get('q') ?? '');
  const [cityCode, setCityCode] = useState(params.get('cityCode') ?? '');
  const [categoryCode, setCategoryCode] = useState(params.get('categoryCode') ?? '');
  const [tab, setTab] = useState<TabType>((params.get('type') as TabType) ?? 'all');
  const [page, setPage] = useState(() => Math.max(1, Number(params.get('page')) || 1));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [professionals, setProfessionals] = useState<PublicProfessionalProfile[]>([]);
  const [services, setServices] = useState<PublicServiceListing[]>([]);
  const [total, setTotal] = useState(0);

  const PAGE_SIZE = 12;

  function updateCanonicalUrl(nextCityCode = cityCode, nextPage = page) {
    const next = new URLSearchParams();
    if (q) next.set('q', q);
    if (nextCityCode) next.set('cityCode', nextCityCode);
    if (categoryCode) next.set('categoryCode', categoryCode);
    if (tab !== 'all') next.set('type', tab);
    if (nextPage > 1) next.set('page', String(nextPage));
    router.replace(next.size ? `/search?${next.toString()}` : '/search');
  }

  async function doSearch(overrides?: { tab?: TabType; page?: number; cityCode?: string }) {
    const activeTab = overrides?.tab ?? tab;
    const activePage = overrides?.page ?? page;
    const activeCityCode = overrides?.cityCode ?? cityCode;
    setIsLoading(true);
    setError('');
    try {
      if (activeTab === 'professional') {
        const data = await api.professionals.search({ q: q || undefined, cityCode: activeCityCode || undefined, page: activePage });
        setProfessionals(data.professionals);
        setBusinesses([]);
        setServices([]);
        setTotal(data.professionals.length);
      } else if (activeTab === 'service') {
        const data = await api.services.search({ q: q || undefined, categoryCode: categoryCode || undefined, page: activePage });
        setServices(data.services);
        setBusinesses([]);
        setProfessionals([]);
        setTotal(data.total);
      } else if (activeTab === 'business') {
        const data = await api.businesses.search({ q: q || undefined, categoryCode: categoryCode || undefined, cityCode: activeCityCode || undefined, page: activePage });
        setBusinesses(data.businesses);
        setServices([]);
        setProfessionals([]);
        setTotal(data.total);
      } else {
        const data = await api.search.query({ q: q || undefined, categoryCode: categoryCode || undefined, cityCode: activeCityCode || undefined, page: activePage, type: activeTab });
        setBusinesses(data.businesses);
        setServices(data.services);
        setProfessionals([]);
        setTotal(data.total);
      }
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر البحث.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    updateCanonicalUrl(cityCode, 1);
    void doSearch({ page: 1 });
  }

  function handleTabChange(nextTab: TabType) {
    setTab(nextTab);
    setPage(1);
    if (searched) void doSearch({ tab: nextTab, page: 1 });
  }

  function handlePage(nextPage: number) {
    setPage(nextPage);
    updateCanonicalUrl(cityCode, nextPage);
    void doSearch({ page: nextPage });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Auto-search when arriving via URL params (from homepage links)
  useEffect(() => {
    const urlQ = params.get('q');
    const rawCity = params.get('cityCode');
    const urlCity = canonicalCityCode(rawCity, cities);
    const urlCat = params.get('categoryCode');
    const urlType = params.get('type') as TabType | null;
    const urlPage = Math.max(1, Number(params.get('page')) || 1);
    if (urlQ || urlCity || urlCat || urlType) {
      if (urlQ) setQ(urlQ);
      setCityCode(urlCity);
      if (urlCat) setCategoryCode(urlCat);
      if (urlType) setTab(urlType);
      setPage(urlPage);
      void doSearch({ tab: urlType ?? 'all', page: urlPage, cityCode: urlCity });
    }
    if (rawCity && cities.length > 0 && !urlCity) router.replace('/search');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities, params]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main id="foundation-content" className="page-shell">
      <div className="page-content">
        <header style={{ marginBlockEnd: '1.5rem' }}>
          <p className="eyebrow">خدمة الرقمية</p>
          <h1 style={{ fontSize: 'clamp(1.75rem, 5vw, 3rem)', margin: '0 0 0.5rem' }}>البحث والاستكشاف</h1>
          <p style={{ color: 'var(--muted)', fontSize: '1rem', margin: 0 }}>ابحث عن الأعمال، المهنيين، والخدمات في سوريا</p>
        </header>

        {/* Search form */}
        <form onSubmit={handleSearch} className="filter-bar" role="search" aria-label="نموذج البحث">
          <div className="filter-group" style={{ flex: '2 1 180px' }}>
            <label htmlFor="q">كلمة البحث</label>
            <input
              id="q"
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="مطعم، نجار، محامي..."
            />
          </div>
          <div className="filter-group" style={{ flex: '1 1 130px' }}>
            <label htmlFor="city">المدينة</label>
            <select id="city" value={cityCode} disabled={citiesLoading || !!citiesError} onChange={(e) => { const next = e.target.value; setCityCode(next); setPage(1); updateCanonicalUrl(next, 1); }}>
              <option value="">كل المدن</option>
              {cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}
            </select>
          </div>
          <div className="filter-group" style={{ flex: '1 1 130px' }}>
            <label htmlFor="cat">التصنيف</label>
            <select id="cat" value={categoryCode} disabled={categoriesLoading || !!categoriesError} onChange={(e) => setCategoryCode(e.target.value)}>
              <option value="">كل التصنيفات</option>
              {categories.map((category) => <option key={category.code} value={category.code}>{category.nameAr}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
            <button type="submit" className="filter-action" aria-busy={isLoading} disabled={isLoading}>
              {!isLoading && <PlatformIcon name="search" size={18} />}
              {isLoading ? 'جاري البحث...' : 'بحث'}
            </button>
            {(q || cityCode || categoryCode) && (
              <button
                type="button"
                className="filter-action-secondary"
                onClick={() => { setQ(''); setCityCode(''); setCategoryCode(''); setPage(1); router.replace('/search'); }}
              >
                مسح
              </button>
            )}
          </div>
        </form>
        {citiesError && <p className="form-error" role="status">{citiesError} <button type="button" onClick={() => void retryCities()}>إعادة المحاولة</button></p>}

        {/* Type tabs */}
        <nav className="type-tabs" aria-label="نوع النتائج">
          {([['all', 'الكل'], ['business', 'أعمال'], ['professional', 'مهنيون'], ['service', 'خدمات']] as [TabType, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`type-tab${tab === value ? ' active' : ''}`}
              onClick={() => handleTabChange(value)}
            >
              {label}
            </button>
          ))}
        </nav>

        {error && <p className="form-error" role="alert" style={{ marginBlockEnd: '1rem' }}>{error}</p>}

        {/* Loading skeleton */}
        {isLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))', gap: '1rem' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton skeleton-card" />
            ))}
          </div>
        )}

        {/* Results */}
        {!isLoading && searched && (
          <>
            <p className="result-count">تم العثور على {total} نتيجة{page > 1 ? ` · الصفحة ${page}` : ''}</p>

            {/* Businesses */}
            {businesses.length > 0 && (
              <section aria-label="ملفات الأعمال" style={{ marginBlockEnd: '2rem' }}>
                {tab === 'all' && <div className="section-header"><h2>ملفات الأعمال ({businesses.length})</h2></div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))', gap: '1rem' }}>
                  {businesses.map((b) => (
                    <article className="card" key={b.id}>
                      <div className="card-body">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <h3 className="card-title">{b.name}</h3>
                          {trustLabel(b.trustStatus)}
                        </div>
                        <p className="card-meta">{categories.find((category) => category.code === b.categoryCode)?.nameAr ?? b.categoryCode} · {cityLabel(b.cityCode, cities)}</p>
                        {b.descriptionAr && <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6, margin: '0.25rem 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.descriptionAr}</p>}
                      </div>
                      <div className="card-footer">
                        <Link href={`/business-profiles/${b.id}`} className="foundation-action" style={{ marginBlockStart: 0, textDecoration: 'none', textAlign: 'center', display: 'block', fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
                          عرض الملف <PlatformIcon name="arrow" size={16} />
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* Professionals */}
            {professionals.length > 0 && (
              <section aria-label="المهنيون" style={{ marginBlockEnd: '2rem' }}>
                {tab === 'all' && <div className="section-header"><h2>المهنيون ({professionals.length})</h2></div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))', gap: '1rem' }}>
                  {professionals.map((p) => (
                    <article className="card" key={p.id}>
                      <div className="card-body">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <h3 className="card-title">{p.headlineAr}</h3>
                          {availLabel(p.availability)}
                        </div>
                        <p className="card-meta">{cityLabel(p.cityCode, cities)} · {p.countryCode}</p>
                        {p.skills.length > 0 && (
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                            {p.skills.slice(0, 4).map((s) => <span key={s} className="skill-tag">{s}</span>)}
                          </div>
                        )}
                      </div>
                      <div className="card-footer">
                        <Link href={`/professional-profiles/${p.id}`} className="foundation-action" style={{ marginBlockStart: 0, textDecoration: 'none', textAlign: 'center', display: 'block', fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
                          عرض الملف <PlatformIcon name="arrow" size={16} />
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* Services */}
            {services.length > 0 && (
              <section aria-label="الخدمات" style={{ marginBlockEnd: '2rem' }}>
                {tab === 'all' && <div className="section-header"><h2>الخدمات ({services.length})</h2></div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))', gap: '1rem' }}>
                  {services.map((s) => (
                    <article className="card" key={s.id}>
                      <div className="card-body">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <h3 className="card-title">{s.titleAr}</h3>
                          <span className="badge badge-pending" style={{ whiteSpace: 'nowrap' }}>{priceLabel(s.priceType)}</span>
                        </div>
                        <p className="card-meta">{categories.find((category) => category.code === s.categoryCode)?.nameAr ?? s.categoryCode}</p>
                        {s.descriptionAr && <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6, margin: '0.25rem 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.descriptionAr}</p>}
                        {s.price != null && (
                          <p style={{ fontWeight: 800, color: 'var(--accent)', fontSize: '1.0625rem', margin: '0.25rem 0 0' }}>
                            {s.price.toLocaleString('ar-SY')} {s.priceCurrency ?? 'SYP'}
                          </p>
                        )}
                      </div>
                      <div className="card-footer">
                        <Link
                          href={s.ownerType === 'business' ? `/business-profiles/${s.ownerId}` : `/professional-profiles/${s.ownerId}`}
                          className="foundation-action"
                          style={{ marginBlockStart: 0, textDecoration: 'none', textAlign: 'center', display: 'flex', fontSize: '0.875rem', padding: '0.5rem 1rem', gap: '0.4rem' }}
                        >
                          عرض مقدم الخدمة <PlatformIcon name="arrow" size={16} />
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {businesses.length === 0 && professionals.length === 0 && services.length === 0 && (
              <div className="empty-state">
                <span className="empty-state-icon" aria-hidden="true"><PlatformIcon name="search" size={42} /></span>
                <h2>لا توجد نتائج</h2>
                <p>جرّب كلمة بحث مختلفة أو قم بتوسيع نطاق البحث.</p>
                <button type="button" className="filter-action" onClick={() => { setQ(''); setCityCode(''); setCategoryCode(''); setPage(1); router.replace('/search'); }}>
                  مسح الفلاتر
                </button>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <nav className="pagination" aria-label="الصفحات">
                <button type="button" className="page-btn" disabled={page <= 1} onClick={() => handlePage(page - 1)}>
                  ‹ السابق
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
                  <button key={p} type="button" className={`page-btn${p === page ? ' active' : ''}`} onClick={() => handlePage(p)}>
                    {p}
                  </button>
                ))}
                <button type="button" className="page-btn" disabled={page >= totalPages} onClick={() => handlePage(page + 1)}>
                  التالي ›
                </button>
              </nav>
            )}
          </>
        )}

        {/* Initial state before search */}
        {!searched && !isLoading && (
          <div className="empty-state" style={{ paddingTop: '3rem' }}>
            <span className="empty-state-icon" aria-hidden="true"><PlatformIcon name="pin" size={42} /></span>
            <h2>ابدأ البحث</h2>
            <p>أدخل كلمة بحث أو اختر مدينة وتصنيفاً للعثور على الأعمال والمهنيين.</p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <main id="foundation-content" className="page-shell">
        <div className="page-content">
          <div className="skeleton skeleton-heading" style={{ marginBlock: '1.5rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))', gap: '1rem', marginTop: '2rem' }}>
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton skeleton-card" />)}
          </div>
        </div>
      </main>
    }>
      <SearchContent />
    </Suspense>
  );
}
