'use client';

import { useRef, useState, type FormEvent } from 'react';
import { api, type PublicProviderReportReceipt } from '../lib/api-client';
import { PlatformIcon } from '../app/components/platform-icon';
import { ActionButton } from '../app/components/ui-primitives';
import styles from './provider-report-form.module.css';

const reasons = [
  ['inaccurate_information', 'معلومات غير دقيقة'], ['inappropriate_content', 'محتوى غير مناسب'],
  ['impersonation', 'انتحال صفة أو اسم'], ['closed_business', 'النشاط مغلق'], ['other', 'سبب آخر']
] as const;

function safeError(error: unknown) {
  const status = error instanceof Error ? (error as Error & { statusCode?: number }).statusCode : undefined;
  if (status === 401) return 'سجّل الدخول أولاً لإرسال البلاغ.';
  if (status === 404) return 'هذا الملف غير متاح للبلاغ حالياً.';
  if (status === 409) return 'لديك بلاغ مفتوح عن هذا الملف بالفعل.';
  return 'تعذر تسجيل البلاغ. لم يتم حفظه؛ حاول مرة أخرى.';
}

export function ProviderReportForm({ target, providerName }: { target: { type: 'business' | 'professional'; id: string }; providerName: string }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<(typeof reasons)[number][0]>('inaccurate_information');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<PublicProviderReportReceipt | null>(null);
  const [error, setError] = useState('');

  function close() { setOpen(false); setError(''); requestAnimationFrame(() => trigger.current?.focus()); }
  async function submit(event: FormEvent) {
    event.preventDefault(); const normalized = details.trim();
    if (normalized.length < 10 || normalized.length > 1000) { setError('اكتب تفاصيل واضحة بين 10 و1000 حرف.'); return; }
    setSubmitting(true); setError('');
    try { const result = await api.reports.submit(target, { reasonCode, details: normalized }); setReceipt(result.report); }
    catch (cause) { setError(safeError(cause)); }
    finally { setSubmitting(false); }
  }

  return <div onKeyDown={(event) => { if (event.key === 'Escape' && !receipt) close(); }}>
    <button ref={trigger} type="button" className={styles.trigger} onClick={() => setOpen(true)} aria-expanded={open} aria-controls="provider-report-panel"><PlatformIcon name="filter" size={17}/> الإبلاغ</button>
    {open && <section id="provider-report-panel" className={styles.panel} aria-labelledby="provider-report-title">
      {receipt ? <div className={styles.success} role="status"><span><PlatformIcon name="check" /></span><h2 id="provider-report-title">تم تسجيل البلاغ</h2><p>سيُراجع فريق خدمة البلاغ عن {providerName}. رقم المتابعة: <bdi>{receipt.id}</bdi></p><ActionButton type="button" variant="secondary" onClick={close}>إغلاق</ActionButton></div> : <>
        <header className={styles.header}><div><h2 id="provider-report-title">الإبلاغ عن {providerName}</h2><p>استخدم البلاغ للمعلومات المخالفة أو المضللة فقط. القرار النهائي للمراجعة البشرية.</p></div><button className={styles.close} type="button" onClick={close} aria-label="إغلاق البلاغ">×</button></header>
        <form className={styles.form} onSubmit={(event) => void submit(event)} aria-busy={submitting}>
          <label htmlFor="report-reason">سبب البلاغ</label><select id="report-reason" value={reasonCode} onChange={(event) => setReasonCode(event.target.value as typeof reasonCode)}>{reasons.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select>
          <label htmlFor="report-details">التفاصيل</label><textarea id="report-details" value={details} onChange={(event) => setDetails(event.target.value)} minLength={10} maxLength={1000} required aria-invalid={!!error} />
          <p className={styles.help}>لا تُدخل كلمات مرور أو وثائق شخصية أو بيانات حساسة.</p>{error && <p className={styles.error} role="alert">{error}</p>}
          <ActionButton type="submit" variant="danger" disabled={submitting}>{submitting ? 'جاري تسجيل البلاغ…' : 'إرسال البلاغ للمراجعة'}</ActionButton>
        </form>
      </>}
    </section>}
  </div>;
}
