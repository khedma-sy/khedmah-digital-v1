'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicProfessionalProfile } from '../../../lib/api-client';

export default function NewProfessionalPage() {
  const router = useRouter();
  const [headlineAr, setHeadlineAr] = useState('');
  const [headlineEn, setHeadlineEn] = useState('');
  const [bioAr, setBioAr] = useState('');
  const [availability, setAvailability] = useState<'available' | 'busy' | 'unavailable'>('available');
  const [cityCode, setCityCode] = useState('damascus');
  const [countryCode, setCountryCode] = useState('SY');
  const [skillsInput, setSkillsInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function prefill() {
      try {
        const data = await api.professionals.getMine();
        if (data.professional) {
          const p: PublicProfessionalProfile = data.professional;
          setHeadlineAr(p.headlineAr);
          setHeadlineEn(p.headlineEn ?? '');
          setBioAr(p.bioAr ?? '');
          setAvailability(p.availability);
          setCityCode(p.cityCode);
          setCountryCode(p.countryCode);
          setSkillsInput(p.skills.join('، '));
        }
      } catch {
        // no existing profile – fine
      }
    }
    void prefill();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    const skills = skillsInput.split(/[،,]+/).map((s) => s.trim()).filter(Boolean);
    try {
      await api.professionals.createOrUpdate({
        headlineAr,
        headlineEn: headlineEn || undefined,
        bioAr: bioAr || undefined,
        availability,
        cityCode,
        countryCode,
        skills: skills.length ? skills : undefined
      });
      router.push('/professionals');
    } catch (err) {
      if (err instanceof Error && (err as Error & { statusCode?: number }).statusCode === 401) {
        router.push('/auth/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'تعذر الحفظ.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main id="foundation-content" className="identity-shell" aria-label="إنشاء / تعديل ملف مهني">
      <section className="identity-card" style={{ width: 'min(100%, 36rem)' }}>
        <p className="eyebrow">خدمة الرقمية</p>
        <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)' }}>ملفي المهني</h1>
        <p>أنشئ أو حدّث ملفك المهني.</p>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <label>
            العنوان المهني (بالعربية) *
            <input type="text" value={headlineAr} onChange={(e) => setHeadlineAr(e.target.value)} required placeholder="مثال: مهندس برمجيات · خبرة 5 سنوات" />
          </label>
          <label>
            العنوان المهني (بالإنجليزية)
            <input type="text" value={headlineEn} onChange={(e) => setHeadlineEn(e.target.value)} placeholder="Software Engineer · 5 years experience" style={{ direction: 'ltr' }} />
          </label>
          <label>
            نبذة مختصرة
            <textarea
              value={bioAr}
              onChange={(e) => setBioAr(e.target.value)}
              placeholder="نبذة عنك وخبراتك..."
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem 1rem', font: 'inherit', resize: 'vertical', minHeight: '5rem' }}
            />
          </label>
          <label>
            التوفر
            <select value={availability} onChange={(e) => setAvailability(e.target.value as typeof availability)} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem 1rem', font: 'inherit' }}>
              <option value="available">متاح</option>
              <option value="busy">مشغول</option>
              <option value="unavailable">غير متاح</option>
            </select>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label>
              المدينة *
              <select value={cityCode} onChange={(e) => setCityCode(e.target.value)} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem 1rem', font: 'inherit' }}>
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
              <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem 1rem', font: 'inherit' }}>
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
            المهارات (مفصولة بفواصل)
            <input type="text" value={skillsInput} onChange={(e) => setSkillsInput(e.target.value)} placeholder="JavaScript، React، Node.js" />
          </label>
          <button type="submit" className="foundation-action" aria-busy={isSubmitting} disabled={isSubmitting} style={{ marginBlockStart: 0 }}>
            {isSubmitting ? 'جاري الحفظ...' : 'حفظ الملف'}
          </button>
        </form>
      </section>
    </main>
  );
}
