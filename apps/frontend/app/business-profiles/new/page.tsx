'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../../lib/api-client';
import { useSyrianCities } from '../../../lib/use-syrian-cities';
import { useCategories } from '../../../lib/use-categories';
import { CategorySelectOptions } from '../../components/category-select-options';
import { ActionButton, ActionLink, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import styles from '../../../components/owner-workspace.module.css';

export default function NewBusinessProfilePage() {
  const router = useRouter();
  const { cities, isLoading: citiesLoading, error: citiesError, retry: retryCities } = useSyrianCities();
  const { categories, isLoading: categoriesLoading, error: categoriesError, retry: retryCategories } = useCategories();
  const [form, setForm] = useState({ name: '', descriptionAr: '', phone: '', email: '', website: '', categoryCode: '', cityCode: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [error, setError] = useState('');
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    let active = true;
    void api.auth.session()
      .then(() => { if (active) setIsCheckingSession(false); })
      .catch((cause) => {
        if (!active) return;
        const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
        if (status === 401) { router.replace('/auth/login?next=%2Fbusiness-profiles%2Fnew'); return; }
        setError(cause instanceof Error ? cause.message : 'تعذر التحقق من جلسة الدخول. حاول مجدداً.');
        setIsCheckingSession(false);
      });
    return () => { active = false; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSubmitting(true); setError('');
    try {
      await api.businesses.create({ name: form.name.trim(), descriptionAr: form.descriptionAr.trim() || undefined, phone: form.phone.trim() || undefined, email: form.email.trim() || undefined, website: form.website.trim() || undefined, categoryCode: form.categoryCode, cityCode: form.cityCode, countryCode: 'SY' });
      router.push('/business-profiles');
    } catch (cause) {
      if (cause instanceof Error && (cause as Error & { statusCode?: number }).statusCode === 401) { router.replace('/auth/login?next=%2Fbusiness-profiles%2Fnew'); return; }
      setError(cause instanceof Error ? cause.message : 'تعذر إنشاء النشاط. راجع البيانات وحاول مجدداً.');
    } finally { setIsSubmitting(false); }
  }

  const unavailable = citiesLoading || categoriesLoading || !!citiesError || !!categoriesError;
  if (isCheckingSession) return <PageShell className={styles.page} label="جاري التحقق من جلسة الدخول"><div className={styles.formShell}><SkeletonGrid count={2} label="جاري تجهيز مساحة صاحب النشاط" /></div></PageShell>;
  return <PageShell className={styles.page} label="إضافة نشاط">
    <div className={styles.formShell}>
      <PageHeader eyebrow="مساحة صاحب النشاط" title="إضافة نشاط جديد" description="أدخل معلومات صحيحة وواضحة. سيُحفظ النشاط كملف خاص ولن يظهر في الدليل قبل إرساله للمراجعة واعتماده." />
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      {(citiesError || categoriesError) && <StatusMessage tone="warning"><p>{citiesError || categoriesError}</p><div className={styles.actions}>{citiesError && <ActionButton type="button" variant="secondary" onClick={() => void retryCities()}>إعادة تحميل المدن</ActionButton>}{categoriesError && <ActionButton type="button" variant="secondary" onClick={() => void retryCategories()}>إعادة تحميل التصنيفات</ActionButton>}</div></StatusMessage>}
      <div className={styles.formLayout}>
        <Surface as="form" className={styles.form} onSubmit={submit}>
          <section className={styles.section}><h2>المعلومات الأساسية</h2><p>استخدم الاسم التجاري المعروف ووصفاً مختصراً يوضح ما يقدمه النشاط.</p><label>اسم النشاط <span className={styles.required}>*</span><input value={form.name} onChange={(event) => update('name', event.target.value)} minLength={2} maxLength={160} required autoComplete="organization" placeholder="مثال: مطعم الأصيل" /></label><label>وصف النشاط<textarea value={form.descriptionAr} onChange={(event) => update('descriptionAr', event.target.value)} maxLength={2000} placeholder="الخدمات الأساسية والخبرة وما يميز النشاط" /><span className={styles.help}>{form.descriptionAr.length.toLocaleString('ar-SY-u-nu-latn')} / 2000</span></label></section>
          <section className={styles.section}><h2>التصنيف والموقع</h2><div className={styles.fieldGrid}><label>التخصص الدقيق <span className={styles.required}>*</span><select value={form.categoryCode} disabled={unavailable} onChange={(event) => update('categoryCode', event.target.value)} required><option value="">اختر تخصص النشاط</option><CategorySelectOptions categories={categories} allowRoots={false} /></select></label><label>المدينة <span className={styles.required}>*</span><select value={form.cityCode} disabled={unavailable} onChange={(event) => update('cityCode', event.target.value)} required><option value="">اختر مدينة سورية</option>{cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}</select></label></div><p className={styles.notice}>اختر التخصص الأدق كي يظهر نشاطك في التصنيف الرئيسي ونتائج البحث المناسبة.</p></section>
          <section className={styles.section}>
            <h2>وسائل التواصل</h2>
            <p>هذه الحقول اختيارية الآن ويمكن استكمالها لاحقاً من إدارة النشاط.</p>
            <div className={styles.fieldGrid}>
              <label>
                رقم الهاتف
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => update('phone', event.target.value)}
                  autoComplete="tel"
                  placeholder="+963…"
                />
              </label>
              <label>
                البريد الإلكتروني
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => update('email', event.target.value)}
                  autoComplete="email"
                  placeholder="name@example.com"
                  dir="ltr"
                />
              </label>
            </div>
            <label>
              الموقع الإلكتروني
              <input
                type="url"
                value={form.website}
                onChange={(event) => update('website', event.target.value)}
                placeholder="https://example.com"
                dir="ltr"
              />
            </label>
          </section>
          <footer className={styles.footer}><ActionLink href="/business-profiles" variant="secondary">إلغاء والعودة</ActionLink><ActionButton type="submit" disabled={isSubmitting || unavailable || !form.name.trim() || !form.categoryCode || !form.cityCode}>{isSubmitting ? 'جارٍ حفظ النشاط…' : 'حفظ النشاط'}</ActionButton></footer>
        </Surface>
        <Surface as="aside" className={styles.guide}><h2>ماذا يحدث بعد الحفظ؟</h2><ol><li>يُنشأ النشاط كملف خاص لا يظهر للعامة.</li><li>تضيف الخدمات والصور وساعات العمل من لوحة الإدارة.</li><li>ترسل الملف إلى فريق المراجعة عندما تصبح معلوماته مكتملة.</li><li>بعد الاعتماد يظهر في البحث والتصنيف والمنطقة.</li></ol><p className={styles.notice}>قرار النشر النهائي بشري. لا يعني إنشاء الملف أنه موثّق أو منشور تلقائياً.</p></Surface>
      </div>
    </div>
  </PageShell>;
}
