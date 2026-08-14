'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicProfessionalProfile } from '../../../lib/api-client';
import { useSyrianCities } from '../../../lib/use-syrian-cities';

export default function NewProfessionalProfilePage() {
  const router = useRouter();
  const { cities, isLoading: citiesLoading, error: citiesError, retry: retryCities } = useSyrianCities();
  const [headlineAr, setHeadlineAr] = useState('');
  const [headlineEn, setHeadlineEn] = useState('');
  const [bioAr, setBioAr] = useState('');
  const [availability, setAvailability] = useState<'available' | 'busy' | 'unavailable'>('available');
  const [cityCode, setCityCode] = useState('');
  const [skillsInput, setSkillsInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function prefill() {
      try {
        const data = await api.professionals.getMine();
        if (data.professional) {
          const profile: PublicProfessionalProfile = data.professional;
          setHeadlineAr(profile.headlineAr);
          setHeadlineEn(profile.headlineEn ?? '');
          setBioAr(profile.bioAr ?? '');
          setAvailability(profile.availability);
          setCityCode(profile.cityCode);
          setSkillsInput(profile.skills.join('، '));
        }
      } catch {
        // ignore missing profile
      }
    }

    void prefill();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    const skills = skillsInput.split(/[،,]+/).map((value) => value.trim()).filter(Boolean);
    try {
      await api.professionals.createOrUpdate({
        headlineAr,
        headlineEn: headlineEn || undefined,
        bioAr: bioAr || undefined,
        availability,
        cityCode,
        countryCode: 'SY',
        skills: skills.length ? skills : undefined
      });
      router.push('/professional-profiles');
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
    <main id="foundation-content" className="identity-shell" aria-label="إنشاء أو تعديل ملف مهني">
      <section className="identity-card" style={{ width: 'min(100%, 36rem)' }}>
        <p className="eyebrow">خدمة الرقمية</p>
        <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)' }}>الملف المهني</h1>
        <p>أنشئ أو حدّث ملفك المهني.</p>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <label>
            العنوان المهني (بالعربية) *
            <input type="text" value={headlineAr} onChange={(event) => setHeadlineAr(event.target.value)} required placeholder="مثال: مهندس برمجيات · خبرة 5 سنوات" />
          </label>
          <label>
            العنوان المهني (بالإنجليزية)
            <input type="text" value={headlineEn} onChange={(event) => setHeadlineEn(event.target.value)} placeholder="Software Engineer · 5 years experience" style={{ direction: 'ltr' }} />
          </label>
          <label>
            نبذة مختصرة
            <textarea
              value={bioAr}
              onChange={(event) => setBioAr(event.target.value)}
              placeholder="نبذة عنك وخبراتك..."
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem 1rem', font: 'inherit', resize: 'vertical', minHeight: '5rem' }}
            />
          </label>
          <label>
            التوفر
            <select value={availability} onChange={(event) => setAvailability(event.target.value as typeof availability)} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem 1rem', font: 'inherit' }}>
              <option value="available">متاح</option>
              <option value="busy">مشغول</option>
              <option value="unavailable">غير متاح</option>
            </select>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label>
              المدينة *
              <select value={cityCode} disabled={citiesLoading || !!citiesError} onChange={(event) => setCityCode(event.target.value)} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem 1rem', font: 'inherit' }}>
                <option value="">اختر مدينة</option>
                {cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}
              </select>
            </label>
            <label>
              الدولة *
              <select value="SY" disabled style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem 1rem', font: 'inherit' }}>
                <option value="SY">سوريا</option>
              </select>
            </label>
          </div>
          {citiesError && <p className="form-error" role="status">{citiesError} <button type="button" onClick={() => void retryCities()}>إعادة المحاولة</button></p>}
          <label>
            المهارات (مفصولة بفواصل)
            <input type="text" value={skillsInput} onChange={(event) => setSkillsInput(event.target.value)} placeholder="JavaScript، React، Node.js" />
          </label>
          <button type="submit" className="foundation-action" aria-busy={isSubmitting} disabled={isSubmitting || citiesLoading || !!citiesError || !cityCode} style={{ marginBlockStart: 0 }}>
            {isSubmitting ? 'جاري الحفظ...' : 'حفظ الملف'}
          </button>
        </form>
      </section>
    </main>
  );
}
