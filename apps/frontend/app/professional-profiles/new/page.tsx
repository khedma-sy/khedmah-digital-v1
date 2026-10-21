'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type PublicProfessionalProfile, type UploadedMediaAsset, type VerificationRequest } from '../../../lib/api-client';
import { useSyrianCities } from '../../../lib/use-syrian-cities';
import { ActionButton, ActionLink, PageHeader, PageShell, StatusMessage, Surface } from '../../components/ui-primitives';
import styles from '../../../components/owner-workspace.module.css';

const ALLOWED_EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const fileContent = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('read_failed'));
  reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
  reader.readAsDataURL(file);
});

export default function ProfessionalProfileEditorPage() {
  const router = useRouter();
  const { cities, isLoading: citiesLoading, error: citiesError, retry: retryCities } = useSyrianCities();
  const [profileId, setProfileId] = useState('');
  const [contentRevision, setContentRevision] = useState<string>();
  const [requiresReload, setRequiresReload] = useState(false);
  const [bioEn, setBioEn] = useState<string>();
  const [retryCount, setRetryCount] = useState(0);
  const lifecycle = useRef(0);
  const submissionInProgress = useRef(false);
  const evidenceInProgress = useRef(false);
  const [form, setForm] = useState({ headlineAr: '', headlineEn: '', bioAr: '', availability: 'available' as PublicProfessionalProfile['availability'], cityCode: '', skills: '' });
  const [isPrefilling, setIsPrefilling] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prefillFailed, setPrefillFailed] = useState(false);
  const [error, setError] = useState('');
  const [verificationEvidence, setVerificationEvidence] = useState<UploadedMediaAsset[]>([]);
  const [verification, setVerification] = useState<VerificationRequest | null>(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceNotice, setEvidenceNotice] = useState('');
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    lifecycle.current += 1;
    return () => { lifecycle.current += 1; };
  }, []);

  useEffect(() => {
    setIsPrefilling(true);
    setPrefillFailed(false);
    setError('');
    let active = true;
    void api.professionals.getMine().then(async ({ professional }) => {
      if (!active || !professional) return;
      setProfileId(professional.id);
      setContentRevision(professional.contentRevision);
      setRequiresReload(!professional.contentRevision);
      if (!professional.contentRevision) setError('تعذر تأكيد نسخة الملف. أعد تحميله قبل الحفظ.');
      setBioEn(professional.bioEn);
      setForm({ headlineAr: professional.headlineAr, headlineEn: professional.headlineEn ?? '', bioAr: professional.bioAr ?? '', availability: professional.availability, cityCode: professional.cityCode, skills: professional.skills.join('، ') });
      try {
        const [assets, verificationState] = await Promise.all([
          api.media.listForOwner('professional_profile', professional.id),
          api.professionals.getVerificationStatus(professional.id)
        ]);
        if (!active) return;
        setVerificationEvidence(assets.filter((asset) => asset.assetType === 'professional_verification_evidence'));
        setVerification(verificationState.status);
      } catch {
        if (!active) return;
        setEvidenceNotice('تعذر تحميل أدلة التحقق الآن. يمكنك متابعة تعديل الملف ثم إعادة المحاولة.');
      }
    }).catch((cause) => {
      if (!active) return;
      const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
      if (status === 401) {
        setPrefillFailed(true);
        setError('انتهت الجلسة. يرجى تسجيل الدخول.');
        router.replace('/auth/login?next=%2Fprofessional-profiles%2Fnew');
        return;
      }
      if (status === 404) return;
      setPrefillFailed(true);
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل ملفك المهني الحالي. أعد المحاولة قبل إجراء أي تعديل.');
    }).finally(() => { if (active) setIsPrefilling(false); });
    return () => { active = false; };
  }, [router, retryCount]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionInProgress.current || isPrefilling || citiesLoading || citiesError) return;
    if (requiresReload || (profileId && !contentRevision)) { setRequiresReload(true); setError('أعد تحميل الملف الحالي قبل الحفظ. مسودتك ما زالت ظاهرة.'); return; }
    if (prefillFailed) {
      setError('لا يمكن الحفظ قبل التأكد من حالة ملفك الحالي. أعد تحميل الملف أولاً.');
      return;
    }
    submissionInProgress.current = true;
    const generation = lifecycle.current;
    setIsSubmitting(true); setError('');
    const skills = form.skills.split(/[،,]+/).map((value) => value.trim()).filter(Boolean);
    try {
      await api.professionals.createOrUpdate({ expectedContentRevision: contentRevision, headlineAr: form.headlineAr.trim(), headlineEn: form.headlineEn.trim() || undefined, bioAr: form.bioAr.trim() || undefined, bioEn, availability: form.availability, cityCode: form.cityCode, countryCode: 'SY', skills: skills.length ? skills : undefined });
      if (generation === lifecycle.current) router.push('/professional-profiles');
    } catch (cause) {
      if (generation !== lifecycle.current) return;
      if (cause instanceof Error && (cause as Error & { statusCode?: number }).statusCode === 401) { router.replace('/auth/login?next=%2Fprofessional-profiles%2Fnew'); return; }
      if (cause instanceof Error && (cause as Error & { statusCode?: number }).statusCode === 409) {
        setRequiresReload(true); setError('تغيّر الملف في مكان آخر. مسودتك ما زالت ظاهرة؛ انسخ ما تحتاجه ثم حمّل النسخة الحالية قبل التعديل.'); return;
      }
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ الملف المهني.');
    } finally { if (generation === lifecycle.current) { submissionInProgress.current = false; setIsSubmitting(false); } }
  }

  async function refreshVerificationEvidence(id: string) {
    const [assets, verificationState] = await Promise.all([
      api.media.listForOwner('professional_profile', id),
      api.professionals.getVerificationStatus(id)
    ]);
    setVerificationEvidence(assets.filter((asset) => asset.assetType === 'professional_verification_evidence'));
    setVerification(verificationState.status);
  }

  async function uploadVerificationEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileId || evidenceInProgress.current) return;
    if (verificationEvidence.length >= 3) { setError('يمكن رفع 3 صور إثبات كحد أقصى.'); return; }
    const input = event.currentTarget.elements.namedItem('verificationEvidence') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !ALLOWED_EVIDENCE_TYPES.includes(file.type as typeof ALLOWED_EVIDENCE_TYPES[number]) || file.size <= 0 || file.size > 5 * 1024 * 1024) {
      setError('اختر صورة JPG أو PNG أو WebP بحجم لا يتجاوز 5 ميغابايت.'); return;
    }
    evidenceInProgress.current = true; setEvidenceBusy(true); setError(''); setEvidenceNotice('');
    try {
      const content = await fileContent(file);
      await api.media.uploadVerificationEvidence('professional_profile', profileId, {
        filename: file.name,
        mimeType: file.type as typeof ALLOWED_EVIDENCE_TYPES[number],
        sizeBytes: file.size,
        content,
        sortOrder: verificationEvidence.length
      });
      input.value = '';
      await refreshVerificationEvidence(profileId);
      setEvidenceNotice('تم حفظ صورة الإثبات بشكل خاص. تغيير الأدلة يلغي صلاحية تحقق سابق ويعيده للمراجعة.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر رفع صورة الإثبات.'); }
    finally { evidenceInProgress.current = false; setEvidenceBusy(false); }
  }

  async function deleteVerificationEvidence(id: string) {
    if (!profileId || evidenceInProgress.current) return;
    evidenceInProgress.current = true; setEvidenceBusy(true); setError(''); setEvidenceNotice('');
    try {
      await api.media.delete(id);
      await refreshVerificationEvidence(profileId);
      setEvidenceNotice('تم حذف صورة الإثبات وإلغاء صلاحية أي تحقق سابق مرتبط بالأدلة القديمة.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر حذف صورة الإثبات.'); }
    finally { evidenceInProgress.current = false; setEvidenceBusy(false); }
  }

  async function requestVerification() {
    if (!profileId || evidenceInProgress.current || verificationEvidence.length === 0) return;
    evidenceInProgress.current = true; setEvidenceBusy(true); setError(''); setEvidenceNotice('');
    try {
      const result = await api.professionals.requestVerification(profileId);
      setVerification(result.request);
      setEvidenceNotice('تم إرسال طلب التحقق للمراجعة البشرية.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إرسال طلب التحقق.'); }
    finally { evidenceInProgress.current = false; setEvidenceBusy(false); }
  }

  return <PageShell className={styles.page} label={profileId ? 'تعديل الملف المهني' : 'إنشاء ملف مهني'}>
    <div className={styles.formShell}>
      <PageHeader eyebrow="مساحة مقدم الخدمة" title={profileId ? 'تعديل ملفك المهني' : 'إنشاء ملف مهني'} description="عرّف بخبرتك ومهاراتك بوضوح حتى يتمكن المستخدم من مقارنة الخدمات والتواصل معك." />
      {error && <StatusMessage tone="danger">{error}{(prefillFailed || requiresReload) && <div className={styles.actions}><ActionButton type="button" variant="secondary" onClick={() => setRetryCount((value) => value + 1)}>إعادة تحميل الملف</ActionButton></div>}</StatusMessage>}
      {citiesError && <StatusMessage tone="warning"><p>{citiesError}</p><ActionButton type="button" variant="secondary" onClick={() => void retryCities()}>إعادة تحميل المدن</ActionButton></StatusMessage>}
      <div className={styles.formLayout}>
        <Surface as="form" className={styles.form} onSubmit={submit} aria-busy={isPrefilling || isSubmitting}>
          <fieldset className={styles.formFields} disabled={isPrefilling || isSubmitting || prefillFailed}><section className={styles.section}><h2>الهوية المهنية</h2><label>العنوان المهني بالعربية <span className={styles.required}>*</span><input name="headlineAr" value={form.headlineAr} onChange={(event) => update('headlineAr', event.target.value)} minLength={3} maxLength={160} required placeholder="مثال: مهندس مدني متخصص في الإشراف والتنفيذ" /></label><label>العنوان بالإنجليزية<input name="headlineEn" value={form.headlineEn} onChange={(event) => update('headlineEn', event.target.value)} maxLength={160} dir="ltr" placeholder="Civil engineer" /></label><label>نبذة مهنية<textarea name="bioAr" value={form.bioAr} onChange={(event) => update('bioAr', event.target.value)} maxLength={2000} placeholder="اكتب خبرتك والتخصصات ونطاق الخدمات التي تقدمها" /><span className={styles.help}>{form.bioAr.length.toLocaleString('ar-SY')} / ٢٠٠٠</span></label></section>
          <section className={styles.section}><h2>التوفر والموقع</h2><div className={styles.fieldGrid}><label>حالة التوفر<select name="availability" value={form.availability} onChange={(event) => update('availability', event.target.value)}><option value="available">متاح للعمل</option><option value="busy">مشغول حالياً</option><option value="unavailable">غير متاح حالياً</option></select></label><label>المدينة <span className={styles.required}>*</span><select name="cityCode" value={form.cityCode} disabled={citiesLoading || !!citiesError} onChange={(event) => update('cityCode', event.target.value)} required><option value="">اختر مدينة سورية</option>{cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}</select></label></div></section>
          <section className={styles.section}><h2>المهارات والتخصصات</h2><label>اكتب المهارات مفصولة بفاصلة<input name="skills" value={form.skills} onChange={(event) => update('skills', event.target.value)} placeholder="إشراف هندسي، إدارة مشاريع، مخططات تنفيذية" /><span className={styles.help}>أضف مهارات حقيقية ومحددة تساعد في ظهور ملفك بنتائج البحث المناسبة.</span></label></section>
          <footer className={styles.footer}><ActionLink href="/professional-profiles" variant="secondary">إلغاء والعودة</ActionLink><ActionButton type="submit" disabled={isSubmitting || isPrefilling || prefillFailed || requiresReload || citiesLoading || !!citiesError || !form.headlineAr.trim() || !form.cityCode}>{isSubmitting ? 'جارٍ حفظ الملف…' : profileId ? 'حفظ التعديلات' : 'إنشاء الملف'}</ActionButton></footer></fieldset>
        </Surface>
        <Surface as="aside" className={styles.guide}><h2>ملف مهني قوي</h2><ol><li>استخدم عنواناً يشرح تخصصك بدلاً من اسم عام.</li><li>أضف خبرتك والمهارات التي تقدمها فعلياً.</li><li>أكمل خدماتك وصور أعمالك بعد حفظ الملف.</li><li>أرسل الملف للمراجعة قبل ظهوره للعامة.</li></ol><p className={styles.notice}>لا تعرض معلومات شخصية حساسة. التواصل يتم عبر الاستفسارات المنظمة في «خدمة».</p></Surface>
      </div>
      {profileId && <Surface className={styles.form}><h2>أدلة التحقق الخاصة</h2><p>ارفع من صورة إلى 3 صور إثبات خاصة. لا تظهر للعملاء ولا تعني أصالتها أو قبولها قبل المراجعة البشرية.</p>{evidenceNotice && <StatusMessage tone="success">{evidenceNotice}</StatusMessage>}<div>{verificationEvidence.map((asset, index) => <article key={asset.id}><strong>صورة إثبات {index + 1}: {asset.filename}</strong><div className={styles.actions}><a href={`/api/v1/media/public/${encodeURIComponent(asset.id)}`} target="_blank" rel="noopener noreferrer">فتح خاص</a><ActionButton type="button" variant="secondary" disabled={evidenceBusy} onClick={() => void deleteVerificationEvidence(asset.id)}>حذف</ActionButton></div></article>)}</div>{verificationEvidence.length < 3 && <form onSubmit={uploadVerificationEvidence}><label>صورة إثبات<input name="verificationEvidence" type="file" accept="image/jpeg,image/png,image/webp" required disabled={evidenceBusy}/></label><ActionButton type="submit" variant="secondary" disabled={evidenceBusy}>{evidenceBusy ? 'جارٍ التنفيذ…' : 'رفع صورة إثبات'}</ActionButton></form>}<p>حالة التحقق: {verification?.status === 'approved' ? 'تحقق بشري معتمد' : verification?.status === 'pending' ? 'قيد المراجعة' : verification?.status === 'rejected' ? 'مرفوض' : 'لم يُطلب'}</p><ActionButton type="button" disabled={evidenceBusy || verificationEvidence.length === 0 || verification?.status === 'pending' || verification?.status === 'approved'} onClick={() => void requestVerification()}>طلب التحقق</ActionButton></Surface>}
    </div>
  </PageShell>;
}
