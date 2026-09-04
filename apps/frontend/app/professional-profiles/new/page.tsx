'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api, type PublicProfessionalProfile } from '../../../lib/api-client';
import { useSyrianCities } from '../../../lib/use-syrian-cities';
import { ActionButton, ActionLink, PageHeader, PageShell, StatusMessage, Surface } from '../../components/ui-primitives';
import styles from '../../../components/owner-workspace.module.css';

export default function ProfessionalProfileEditorPage() {
  const router = useRouter();
  const { cities, isLoading: citiesLoading, error: citiesError, retry: retryCities } = useSyrianCities();
  const [profileId, setProfileId] = useState('');
  const [form, setForm] = useState({ headlineAr: '', headlineEn: '', bioAr: '', availability: 'available' as PublicProfessionalProfile['availability'], cityCode: '', skills: '' });
  const [isPrefilling, setIsPrefilling] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    let active = true;
    void api.professionals.getMine().then(({ professional }) => {
      if (!active || !professional) return;
      setProfileId(professional.id); setForm({ headlineAr: professional.headlineAr, headlineEn: professional.headlineEn ?? '', bioAr: professional.bioAr ?? '', availability: professional.availability, cityCode: professional.cityCode, skills: professional.skills.join('، ') });
    }).catch((cause) => {
      const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
      if (status === 401) router.replace('/auth/login');
    }).finally(() => { if (active) setIsPrefilling(false); });
    return () => { active = false; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSubmitting(true); setError('');
    const skills = form.skills.split(/[،,]+/).map((value) => value.trim()).filter(Boolean);
    try {
      const result = await api.professionals.createOrUpdate({ headlineAr: form.headlineAr.trim(), headlineEn: form.headlineEn.trim() || undefined, bioAr: form.bioAr.trim() || undefined, availability: form.availability, cityCode: form.cityCode, countryCode: 'SY', skills: skills.length ? skills : undefined });
      router.push(`/professional-profiles/${result.professional.id}`);
    } catch (cause) {
      if (cause instanceof Error && (cause as Error & { statusCode?: number }).statusCode === 401) { router.replace('/auth/login'); return; }
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ الملف المهني.');
    } finally { setIsSubmitting(false); }
  }

  return <PageShell className={styles.page} label={profileId ? 'تعديل الملف المهني' : 'إنشاء ملف مهني'}>
    <div className={styles.formShell}>
      <PageHeader eyebrow="مساحة مقدم الخدمة" title={profileId ? 'تعديل ملفك المهني' : 'إنشاء ملف مهني'} description="عرّف بخبرتك ومهاراتك بوضوح حتى يتمكن المستخدم من مقارنة الخدمات والتواصل معك." />
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      {citiesError && <StatusMessage tone="warning"><p>{citiesError}</p><ActionButton type="button" variant="secondary" onClick={() => void retryCities()}>إعادة تحميل المدن</ActionButton></StatusMessage>}
      <div className={styles.formLayout}>
        <Surface as="form" className={styles.form} onSubmit={submit} aria-busy={isPrefilling || isSubmitting}>
          <section className={styles.section}><h2>الهوية المهنية</h2><label>العنوان المهني بالعربية <span className={styles.required}>*</span><input value={form.headlineAr} onChange={(event) => update('headlineAr', event.target.value)} minLength={3} maxLength={160} required placeholder="مثال: مهندس مدني متخصص في الإشراف والتنفيذ" /></label><label>العنوان بالإنجليزية<input value={form.headlineEn} onChange={(event) => update('headlineEn', event.target.value)} maxLength={160} dir="ltr" placeholder="Civil engineer" /></label><label>نبذة مهنية<textarea value={form.bioAr} onChange={(event) => update('bioAr', event.target.value)} maxLength={2000} placeholder="اكتب خبرتك والتخصصات ونطاق الخدمات التي تقدمها" /><span className={styles.help}>{form.bioAr.length.toLocaleString('ar-SY-u-nu-latn')} / 2000</span></label></section>
          <section className={styles.section}><h2>التوفر والموقع</h2><div className={styles.fieldGrid}><label>حالة التوفر<select value={form.availability} onChange={(event) => update('availability', event.target.value)}><option value="available">متاح للعمل</option><option value="busy">مشغول حالياً</option><option value="unavailable">غير متاح حالياً</option></select></label><label>المدينة <span className={styles.required}>*</span><select value={form.cityCode} disabled={citiesLoading || !!citiesError} onChange={(event) => update('cityCode', event.target.value)} required><option value="">اختر مدينة سورية</option>{cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}</select></label></div></section>
          <section className={styles.section}><h2>المهارات والتخصصات</h2><label>اكتب المهارات مفصولة بفاصلة<input value={form.skills} onChange={(event) => update('skills', event.target.value)} placeholder="إشراف هندسي، إدارة مشاريع، مخططات تنفيذية" /><span className={styles.help}>أضف مهارات حقيقية ومحددة تساعد في ظهور ملفك بنتائج البحث المناسبة.</span></label></section>
          <footer className={styles.footer}><ActionLink href={profileId ? `/professional-profiles/${profileId}` : '/professional-profiles'} variant="secondary">إلغاء والعودة</ActionLink><ActionButton type="submit" disabled={isSubmitting || isPrefilling || citiesLoading || !!citiesError || !form.headlineAr.trim() || !form.cityCode}>{isSubmitting ? 'جارٍ حفظ الملف…' : profileId ? 'حفظ التعديلات' : 'إنشاء الملف'}</ActionButton></footer>
        </Surface>
        <Surface as="aside" className={styles.guide}><h2>ملف مهني قوي</h2><ol><li>استخدم عنواناً يشرح تخصصك بدلاً من اسم عام.</li><li>أضف خبرتك والمهارات التي تقدمها فعلياً.</li><li>أكمل خدماتك وصور أعمالك بعد حفظ الملف.</li><li>أرسل الملف للمراجعة قبل ظهوره للعامة.</li></ol><p className={styles.notice}>لا تعرض معلومات شخصية حساسة. التواصل يتم عبر الاستفسارات المنظمة في «خدمة».</p></Surface>
      </div>
    </div>
  </PageShell>;
}
