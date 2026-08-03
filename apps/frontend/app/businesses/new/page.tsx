'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '../../../lib/api-client';

export default function NewBusinessPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [cityCode, setCityCode] = useState('damascus');
  const [countryCode, setCountryCode] = useState('SY');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const result = await api.businesses.create({
        name,
        descriptionAr: descriptionAr || undefined,
        phone: phone || undefined,
        email: email || undefined,
        website: website || undefined,
        categoryCode,
        cityCode,
        countryCode
      });
      router.push('/businesses');
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
    <main id="foundation-content" className="identity-shell" aria-label="إنشاء صفحة عمل">
      <section className="identity-card" style={{ width: 'min(100%, 36rem)' }}>
        <p className="eyebrow">خدمة الرقمية</p>
        <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)' }}>إنشاء صفحة عمل</h1>
        <p>أنشئ صفحتك التجارية على المنصة.</p>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <label>
            اسم العمل *
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="مثال: مطعم الأصيل" />
          </label>
          <label>
            الوصف بالعربية
            <textarea
              value={descriptionAr}
              onChange={(e) => setDescriptionAr(e.target.value)}
              placeholder="وصف مختصر لعملك..."
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem 1rem', font: 'inherit', resize: 'vertical', minHeight: '5rem' }}
            />
          </label>
          <label>
            التصنيف *
            <input type="text" value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)} required placeholder="مثال: restaurant, plumber, lawyer" />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label>
              المدينة *
              <select
                value={cityCode}
                onChange={(e) => setCityCode(e.target.value)}
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem 1rem', font: 'inherit' }}
              >
                <option value="damascus">دمشق</option>
                <option value="aleppo">حلب</option>
                <option value="homs">حمص</option>
                <option value="latakia">اللاذقية</option>
                <option value="hama">حماة</option>
                <option value="deir-ez-zor">دير الزور</option>
                <option value="tartus">طرطوس</option>
                <option value="idlib">إدلب</option>
                <option value="raqqa">الرقة</option>
                <option value="daraa">درعا</option>
              </select>
            </label>
            <label>
              الدولة *
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem 1rem', font: 'inherit' }}
              >
                <option value="SY">سوريا</option>
                <option value="SA">السعودية</option>
                <option value="AE">الإمارات</option>
                <option value="JO">الأردن</option>
                <option value="LB">لبنان</option>
                <option value="EG">مصر</option>
                <option value="IQ">العراق</option>
                <option value="TR">تركيا</option>
                <option value="DE">ألمانيا</option>
                <option value="SE">السويد</option>
              </select>
            </label>
          </div>
          <label>
            رقم الهاتف
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+963 11 123 4567" />
          </label>
          <label>
            البريد الإلكتروني
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@example.com" />
          </label>
          <label>
            الموقع الإلكتروني
            <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" />
          </label>
          <button type="submit" className="foundation-action" aria-busy={isSubmitting} disabled={isSubmitting} style={{ marginBlockStart: 0 }}>
            {isSubmitting ? 'جاري الإنشاء...' : 'إنشاء الصفحة'}
          </button>
        </form>
      </section>
    </main>
  );
}
