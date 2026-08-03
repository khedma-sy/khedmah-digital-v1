'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, City, Country } from '../../lib/api-client';

export default function LocationsPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadLocations() {
    setIsLoading(true);
    setError('');
    try {
      const [citiesData, countriesData] = await Promise.all([
        api.locations.cities(),
        api.locations.countries()
      ]);
      setCities(citiesData.cities);
      setCountries(countriesData.countries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل المواقع.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main id="foundation-content" className="identity-shell" aria-label="المواقع">
      <section className="identity-card">
        <p className="eyebrow">Khedmah Digital V1</p>
        <h1>المواقع</h1>
        <p>إدارة المواقع المرتبطة بالملفات والخدمات.</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="foundation-action" type="button" aria-busy={isLoading} disabled={isLoading} onClick={loadLocations}>
            {isLoading ? 'جاري التحديث...' : 'تحديث القائمة'}
          </button>
          <Link className="foundation-action" href="/business-profiles">ملفات الأعمال</Link>
          <Link className="foundation-action" href="/professional-profiles">الملفات المهنية</Link>
          <Link className="foundation-action" href="/service-catalog">دليل الخدمات</Link>
          <Link className="foundation-action" href="/search">البحث</Link>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {cities.length === 0 && countries.length === 0 && !isLoading ? <p style={{ marginTop: '1rem' }}>لا توجد مواقع حالياً.</p> : null}
        {cities.length > 0 && (
          <div>
            <h2>المدن</h2>
            <ul className="foundation-list" aria-label="قائمة المدن">
              {cities.map((city) => (
                <li key={city.code}>
                  <strong>{city.nameAr}</strong>
                  <p>{city.nameEn} · {city.countryCode}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        {countries.length > 0 && (
          <div>
            <h2>الدول</h2>
            <ul className="foundation-list" aria-label="قائمة الدول">
              {countries.map((country) => (
                <li key={country.code}>
                  <strong>{country.nameAr}</strong>
                  <p>{country.nameEn} · {country.code}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
