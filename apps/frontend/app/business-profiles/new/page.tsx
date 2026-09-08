'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
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
  const [ownerId, setOwnerId] = useState('');
  const [existingBusinessId, setExistingBusinessId] = useState('');
  const createRequest = useRef<{ ownerId: string; id: string } | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const lifecycle = useRef(0);
  const submissionInProgress = useRef(false);
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    lifecycle.current += 1;
    return () => { lifecycle.current += 1; };
  }, []);

  useEffect(() => {
    let active = true;
    setIsCheckingSession(true); setSessionError('');
    void api.auth.session()
      .then(({ user }) => { if (active) { setOwnerId(user.id); setIsCheckingSession(false); } })
      .catch((cause) => {
        if (!active) return;
        const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
        if (status === 401) { router.replace('/auth/login?next=%2Fbusiness-profiles%2Fnew'); return; }
        setSessionError(cause instanceof Error ? cause.message : 'تعذر التحقق من جلسة الدخول. حاول مجدداً.');
        setIsCheckingSession(false);
      });
    return () => { active = false; };
  }, [router, retryCount]);

  function requestIdForOwner() {
    if (createRequest.current?.ownerId === ownerId) return createRequest.current.id;
    const key = `khedmah.business-create.${ownerId}`;
    let stored: string | null = null;
    try { stored = sessionStorage.getItem(key); } catch { /* Storage is optional; in-page retries retain the ID. */ }
    const id = stored && /^[A-Za-z0-9_-]{16,100}$/.test(stored) ? stored : crypto.randomUUID();
    createRequest.current = { ownerId, id };
    try { sessionStorage.setItem(key, id); } catch { /* Optional browser storage. */ }
    return id;
  }
  function clearCreateRequest() {
    const current = createRequest.current;
    if (current) {
      const key = `khedmah.business-create.${current.ownerId}`;
      try { if (sessionStorage.getItem(key) === current.id) sessionStorage.removeItem(key); } catch { /* Optional browser storage. */ }
    }
    createRequest.current = null;
  }
  function startAnotherBusiness() {
    if (submissionInProgress.current) return;
    clearCreateRequest(); setExistingBusinessId(''); setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionInProgress.current || !ownerId || existingBusinessId || isCheckingSession || sessionError || citiesLoading || categoriesLoading || citiesError || categoriesError) return;
    submissionInProgress.current = true;
    const generation = lifecycle.current;
    setIsSubmitting(true); setError('');
    try {
      await api.businesses.create({ clientRequestId: requestIdForOwner(), name: form.name.trim(), descriptionAr: form.descriptionAr.trim() || undefined, phone: form.phone.trim() || undefined, email: form.email.trim() || undefined, website: form.website.trim() || undefined, categoryCode: form.categoryCode, cityCode: form.cityCode, countryCode: 'SY' });
      if (generation === lifecycle.current) { clearCreateRequest(); router.push('/business-profiles'); }
    } catch (cause) {
      if (generation !== lifecycle.current) return;
      if (cause instanceof Error && (cause as Error & { statusCode?: number }).statusCode === 401) { router.replace('/auth/login?next=%2Fbusiness-profiles%2Fnew'); return; }
      const issue = cause instanceof Error ? cause as Error & { code?: string; businessId?: string } : undefined;
      if (issue?.code === 'BUSINESS_DRAFT_EXISTS' && issue.businessId) {
        setExistingBusinessId(issue.businessId); setError('وجدنا نشاطاً محفوظاً لهذه المحاولة ببيانات مختلفة. افتحه لمراجعة النسخة الحالية.'); return;
      }
      if (cause instanceof Error && (cause as Error & { statusCode?: number }).statusCode === 400) { setError(cause.message); return; }
      setError('تعذر تأكيد حفظ النشاط. يمكنك إعادة المحاولة؛ سنستخدم المحاولة نفسها لتجنب تكرار النشاط.');
    } finally { if (generation === lifecycle.current) { submissionInProgress.current = false; setIsSubmitting(false); } }
  }

  const unavailable = citiesLoading || categoriesLoading || !!citiesError || !!categoriesError;
  if (isCheckingSession) return <PageShell className={styles.page} label="جاري التحقق من جلسة الدخول"><div className={styles.formShell}><SkeletonGrid count={2} label="جاري تجهيز مساحة صاحب النشاط" /></div></PageShell>;
  if (sessionError) return <PageShell className={styles.page} label="إضافة نشاط"><PageHeader title="تعذر التحقق من الجلسة" /><StatusMessage tone="danger">{sessionError}</StatusMessage><ActionButton type="button" variant="secondary" onClick={() => setRetryCount((value) => value + 1)}>إعادة التحقق من الجلسة</ActionButton></PageShell>;
  return <PageShell className={styles.page} label="إضافة نشاط">
    <div className={styles.formShell}>
      <PageHeader eyebrow="مساحة صاحب النشاط" title="إضافة نشاط جديد" description="أدخل معلومات صحيحة وواضحة. سيُحفظ النشاط كملف خاص ولن يظهر في الدليل قبل إرساله للمراجعة واعتماده." />
      {error && <StatusMessage tone="danger">{error}{existingBusinessId && <div className={styles.actions}><ActionLink href={`/business-profiles/${encodeURIComponent(existingBusinessId)}/manage`}>فتح النشاط المحفوظ</ActionLink><ActionButton type="button" variant="secondary" onClick={startAnotherBusiness}>بدء نشاط آخر</ActionButton></div>}</StatusMessage>}
      {(citiesError || categoriesError) && <StatusMessage tone="warning"><p>{citiesError || categoriesError}</p><div className={styles.actions}>{citiesError && <ActionButton type="button" variant="secondary" onClick={() => void retryCities()}>إعادة تحميل المدن</ActionButton>}{categoriesError && <ActionButton type="button" variant="secondary" onClick={() => void retryCategories()}>إعادة تحميل التصنيفات</ActionButton>}</div></StatusMessage>}
      <div className={styles.formLayout}>
        <Surface as="form" className={styles.form} onSubmit={submit}>
          <fieldset className={styles.formFields} disabled={isSubmitting}><section className={styles.section}><h2>المعلومات الأساسية</h2><p>استخدم الاسم التجاري المعروف ووصفاً مختصراً يوضح ما يقدمه النشاط.</p><label>اسم النشاط <span className={styles.required}>*</span><input name="name" value={form.name} onChange={(event) => update('name', event.target.value)} minLength={2} maxLength={160} required autoComplete="organization" placeholder="مثال: مطعم الأصيل" /></label><label>وصف النشاط<textarea name="descriptionAr" value={form.descriptionAr} onChange={(event) => update('descriptionAr', event.target.value)} maxLength={2000} placeholder="الخدمات الأساسية والخبرة وما يميز النشاط" /><span className={styles.help}>{form.descriptionAr.length.toLocaleString('ar-SY')} / ٢٠٠٠</span></label></section>
          <section className={styles.section}><h2>التصنيف والموقع</h2><div className={styles.fieldGrid}><label>التخصص الدقيق <span className={styles.required}>*</span><select name="categoryCode" value={form.categoryCode} disabled={unavailable} onChange={(event) => update('categoryCode', event.target.value)} required><option value="">اختر تخصص النشاط</option><CategorySelectOptions categories={categories} allowRoots={false} /></select></label><label>المدينة <span className={styles.required}>*</span><select name="cityCode" value={form.cityCode} disabled={unavailable} onChange={(event) => update('cityCode', event.target.value)} required><option value="">اختر مدينة سورية</option>{cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}</select></label></div><p className={styles.notice}>اختر التخصص الأدق كي يظهر نشاطك في التصنيف الرئيسي ونتائج البحث المناسبة.</p></section>
          <section className={styles.section}>
            <h2>وسائل التواصل</h2>
            <p>هذه الحقول اختيارية الآن ويمكن استكمالها لاحقاً من إدارة النشاط.</p>
            <div className={styles.fieldGrid}>
              <label>
                رقم الهاتف
                <input
                  type="tel"
                  name="phone" value={form.phone}
                  onChange={(event) => update('phone', event.target.value)}
                  autoComplete="tel"
                  placeholder="+963…"
                />
              </label>
              <label>
                البريد الإلكتروني
                <input
                  type="email"
                  name="email" value={form.email}
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
                name="website" value={form.website}
                onChange={(event) => update('website', event.target.value)}
                placeholder="https://example.com"
                dir="ltr"
              />
            </label>
          </section>
          <footer className={styles.footer}><ActionLink href="/business-profiles" variant="secondary">إلغاء والعودة</ActionLink><ActionButton type="submit" disabled={isSubmitting || !!existingBusinessId || unavailable || !form.name.trim() || !form.categoryCode || !form.cityCode}>{isSubmitting ? 'جارٍ حفظ النشاط…' : 'حفظ النشاط'}</ActionButton></footer></fieldset>
        </Surface>
        <Surface as="aside" className={styles.guide}><h2>ماذا يحدث بعد الحفظ؟</h2><ol><li>يُنشأ النشاط كملف خاص لا يظهر للعامة.</li><li>تضيف الخدمات والصور وساعات العمل من لوحة الإدارة.</li><li>ترسل الملف إلى فريق المراجعة عندما تصبح معلوماته مكتملة.</li><li>بعد الاعتماد يظهر في البحث والتصنيف والمنطقة.</li></ol><p className={styles.notice}>قرار النشر النهائي بشري. لا يعني إنشاء الملف أنه موثّق أو منشور تلقائياً.</p></Surface>
      </div>
    </div>
  </PageShell>;
}
