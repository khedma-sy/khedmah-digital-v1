'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '../../../lib/api-client';
import { useSyrianCities } from '../../../lib/use-syrian-cities';
import { useCategories } from '../../../lib/use-categories';

export default function NewBusinessProfilePage() {
  const router = useRouter();
  const { cities, isLoading: citiesLoading, error: citiesError, retry: retryCities } = useSyrianCities();
  const { categories, isLoading: categoriesLoading, error: categoriesError, retry: retryCategories } = useCategories();
  const [name, setName] = useState('');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [cityCode, setCityCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      await api.businesses.create({
        name,
        descriptionAr: descriptionAr || undefined,
        phone: phone || undefined,
        email: email || undefined,
        website: website || undefined,
        categoryCode,
        cityCode,
        countryCode: 'SY'
      });
      router.push('/business-profiles');
    } catch (err) {
      if (err instanceof Error && (err as Error & { statusCode?: number }).statusCode === 401) {
        router.push('/auth/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'تعذر الإنشاء.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main id="foundation-content" className="identity-shell" aria-label="إنشاء ملف عمل">
      <section className="identity-card" style={{ width: 'min(100%, 36rem)' }}>
        <p className="eyebrow">خدمة الرقمية</p>
        <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)' }}>إنشاء ملف عمل</h1>
        <p>أنشئ ملف عملك على المنصة.</p>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <label>
            اسم العمل *
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} required placeholder="مثال: مطعم الأصيل" />
          </label>
          <label>
            الوصف بالعربية
            <textarea
              value={descriptionAr}
              onChange={(event) => setDescriptionAr(event.target.value)}
              placeholder="وصف مختصر لعملك..."
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem 1rem', font: 'inherit', resize: 'vertical', minHeight: '5rem' }}
            />
          </label>
          <label>
            التصنيف *
            <select value={categoryCode} disabled={categoriesLoading || !!categoriesError} onChange={(event) => setCategoryCode(event.target.value)} required>
              <option value="">اختر تصنيفاً معتمداً</option>
              {categories.map((category) => <option key={category.code} value={category.code}>{category.nameAr}</option>)}
            </select>
          </label>
          {categoriesError && <p className="form-error" role="status">{categoriesError} <button type="button" onClick={() => void retryCategories()}>إعادة المحاولة</button></p>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label>
              المدينة *
              <select
                value={cityCode}
                disabled={citiesLoading || !!citiesError}
                onChange={(event) => setCityCode(event.target.value)}
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem 1rem', font: 'inherit' }}
              >
                <option value="">اختر مدينة</option>
                {cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}
              </select>
            </label>
            <label>
              الدولة *
              <select
                value="SY"
                disabled
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem 1rem', font: 'inherit' }}
              >
                <option value="SY">سوريا</option>
              </select>
            </label>
          </div>
          {citiesError && <p className="form-error" role="status">{citiesError} <button type="button" onClick={() => void retryCities()}>إعادة المحاولة</button></p>}
          <label>
            رقم الهاتف
            <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+963 11 123 4567" />
          </label>
          <label>
            البريد الإلكتروني
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="info@example.com" />
          </label>
          <label>
            الموقع الإلكتروني
            <input type="url" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://example.com" />
          </label>
          <button type="submit" className="foundation-action" aria-busy={isSubmitting} disabled={isSubmitting || citiesLoading || categoriesLoading || !!citiesError || !!categoriesError || !cityCode || !categoryCode} style={{ marginBlockStart: 0 }}>
            {isSubmitting ? 'جاري الإنشاء...' : 'إنشاء الملف'}
          </button>
        </form>
      </section>
    </main>
  );
}
