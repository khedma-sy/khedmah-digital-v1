'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api-client';
import {
  verificationReviewApi,
  type VerificationDecision,
  type VerificationEvidenceItem,
  type VerificationProfileSummary,
  type VerificationReviewItem
} from '../../../lib/verification-review-client';

type ReviewDialog = { item: VerificationReviewItem; decision: VerificationDecision };
const noteMinimum = 10;
const messageFor = (value: unknown, fallback: string) => value instanceof Error ? value.message : fallback;
const statusCodeFor = (value: unknown) => value && typeof value === 'object' && 'statusCode' in value ? value.statusCode : undefined;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isOptionalText = (value: unknown): value is string | undefined => value === undefined || typeof value === 'string';
const isProfileSummary = (value: unknown, entityType: VerificationReviewItem['entityType']): value is VerificationProfileSummary => {
  if (!isRecord(value) || value.entityType !== entityType) return false;
  if (entityType === 'business') {
    return isText(value.name) && isText(value.categoryCode) && isText(value.cityCode)
      && isOptionalText(value.descriptionAr) && isOptionalText(value.descriptionEn) && isOptionalText(value.phone)
      && isOptionalText(value.email) && isOptionalText(value.website) && isOptionalText(value.addressAr);
  }
  return isText(value.headlineAr) && isText(value.cityCode) && isText(value.countryCode)
    && isOptionalText(value.headlineEn) && isOptionalText(value.bioAr) && isOptionalText(value.bioEn)
    && Array.isArray(value.skills) && value.skills.every(isText);
};
const isEvidence = (value: unknown): value is VerificationEvidenceItem => {
  if (!isRecord(value) || !isText(value.id) || !isText(value.filename) || !isText(value.mimeType)
      || typeof value.sizeBytes !== 'number' || !Number.isFinite(value.sizeBytes) || value.sizeBytes <= 0
      || !isText(value.createdAt) || !isText(value.secureUrl)) return false;
  return ['image/jpeg', 'image/png', 'image/webp'].includes(value.mimeType)
    && value.secureUrl === `/api/v1/media/public/${encodeURIComponent(value.id)}`;
};
const reviewEvidence = (item: VerificationReviewItem): VerificationEvidenceItem[] =>
  Array.isArray(item.evidence) ? item.evidence.filter(isEvidence) : [];
const reviewDataReady = (item: VerificationReviewItem) => {
  if (!Array.isArray(item.evidence)) return false;
  const evidence = reviewEvidence(item);
  return isProfileSummary(item.profileSummary, item.entityType) && evidence.length >= 1 && evidence.length <= 3
    && evidence.length === item.evidence.length;
};

export default function VerificationReviewPage() {
  const [requests, setRequests] = useState<VerificationReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [hasSecurityAuthority, setHasSecurityAuthority] = useState(false);
  const [dialog, setDialog] = useState<ReviewDialog | null>(null);
  const [notes, setNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const lifecycle = useRef(0);
  const queueSequence = useRef(0);
  const actionInProgress = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    lifecycle.current += 1;
    return () => { lifecycle.current += 1; queueSequence.current += 1; };
  }, []);

  async function loadQueue() {
    const request = ++queueSequence.current;
    setLoading(true);
    setHasSecurityAuthority(false);
    setDialog((current) => current?.decision === 'rejected' ? null : current);
    try {
      const [result, securityAuthority] = await Promise.all([
        verificationReviewApi.pending(),
        (async () => {
          try {
            const { operationsProduct } = await api.operationsProduct.overview();
            return operationsProduct.permissions.includes('security.manage');
          } catch {
            return false;
          }
        })()
      ]);
      if (request !== queueSequence.current) return;
      setRequests(result.requests);
      setHasSecurityAuthority(securityAuthority);
      if (!securityAuthority) setDialog((current) => current?.decision === 'rejected' ? null : current);
      setError('');
    } catch (cause) {
      if (request === queueSequence.current) setError(messageFor(cause, 'تعذر تحميل طلبات التحقق.'));
    } finally {
      if (request === queueSequence.current) setLoading(false);
    }
  }

  useEffect(() => { void loadQueue(); }, []);

  function openDialog(item: VerificationReviewItem, decision: VerificationDecision) {
    if (decision === 'rejected' && !hasSecurityAuthority) return;
    if (decision === 'approved' && !reviewDataReady(item)) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setFeedback(null);
    setNotes('');
    setDialog({ item, decision });
  }

  function closeDialog() {
    if (actionInProgress.current) return;
    setDialog(null);
    setNotes('');
    const generation = lifecycle.current;
    window.requestAnimationFrame(() => { if (generation === lifecycle.current) returnFocus.current?.focus(); });
  }

  async function executeDecision() {
    if (!dialog || actionInProgress.current || notes.trim().length < noteMinimum) return;
    if (dialog.decision === 'rejected' && !hasSecurityAuthority) return;
    if (dialog.decision === 'approved' && !reviewDataReady(dialog.item)) return;
    actionInProgress.current = true;
    queueSequence.current += 1;
    const generation = lifecycle.current;
    const active = () => lifecycle.current === generation;
    setActionLoading(true);
    setFeedback(null);
    try {
      await verificationReviewApi.decide(dialog.item.requestId, dialog.decision, dialog.item.profileRevision, notes.trim());
      if (!active()) return;
      setDialog(null);
      setNotes('');
      setFeedback({
        tone: 'success',
        text: dialog.decision === 'approved'
          ? 'تم تسجيل اعتماد التحقق البشري. لا يتم اعتماد مراجعة المحتوى تلقائيًا.'
          : 'تم رفض طلب التحقق وتسجيل ملاحظة المراجع.'
      });
      await loadQueue();
    } catch (cause) {
      if (!active()) return;
      if (statusCodeFor(cause) === 409) {
        setDialog(null);
        setNotes('');
        setFeedback({ tone: 'error', text: 'تغير الطلب أو الملف منذ فتح القائمة. تم تحديث الطابور؛ راجع النسخة الحالية قبل اتخاذ قرار جديد.' });
        await loadQueue();
      } else {
        setFeedback({ tone: 'error', text: messageFor(cause, 'تعذر تسجيل قرار التحقق.') });
      }
    } finally {
      if (active()) {
        actionInProgress.current = false;
        setActionLoading(false);
      }
    }
  }

  if (loading) return <main id="foundation-content" className="operations-shell" aria-busy="true"><section className="operations-panel"><p>جاري تحميل طلبات التحقق…</p></section></main>;

  return <main id="foundation-content" className="operations-shell" dir="rtl" aria-label="مراجعة طلبات التحقق">
    <header className="operations-header">
      <div><p className="eyebrow">خدمة · التحقق</p><h1>مراجعة التحقق البشري</h1><p>طلبات تحقق منفصلة عن مراجعة المحتوى. كل قرار مرتبط بطلب محدد ونسخة الملف التي شاهدها المراجع.</p></div>
      <span className="status-badge">{requests.length} طلب معلق</span>
    </header>

    <nav className="admin-navigation" aria-label="التنقل الإداري">
      <Link href="/admin">لوحة الإدارة</Link>
      <Link href="/admin/moderation">{hasSecurityAuthority ? 'مراجعة المحتوى والبلاغات' : 'مراجعة المحتوى'}</Link>
      <Link href="/admin/verification" aria-current="page">التحقق</Link>
    </nav>

    <section className="operations-panel">
      <h2>حدود القرار</h2>
      <p>افتح كل صور الإثبات الحالية وراجعها بصريًا قبل القرار. النظام لا يثبت أصالة الوثيقة آليًا. اعتماد تحقق النشاط التجاري يمكن أن يعتمد حالة الثقة فقط، ولا يعتمد محتوى النشاط. اعتماد تحقق المهني يسجل نتيجة التحقق فقط ولا يغيّر حالة مراجعة المحتوى أو دورة حياة الملف أو النشر.</p>
    </section>

    {error && <p className="moderation-feedback error" role="alert">{error} <button type="button" disabled={actionLoading} onClick={() => void loadQueue()}>إعادة المحاولة</button></p>}
    {feedback && <p className={`moderation-feedback ${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}

    {!error && <section className="operations-panel moderation-section" aria-labelledby="verification-queue-title">
      <div className="panel-heading"><h2 id="verification-queue-title">طلبات التحقق المعلقة</h2><span>{requests.length}</span></div>
      {requests.length === 0
        ? <p className="moderation-empty">لا توجد طلبات تحقق بانتظار المراجعة.</p>
        : <div className="moderation-list">{requests.map((item) => { const summary = isProfileSummary(item.profileSummary, item.entityType) ? item.profileSummary : null; const evidence = reviewEvidence(item); const dataReady = reviewDataReady(item); return <article className="moderation-card" key={item.requestId}>
            <div>
              <h3>{summary?.entityType === 'business' ? summary.name : summary?.entityType === 'professional' ? summary.headlineAr : item.label}</h3>
              <p>{item.entityType === 'business' ? 'نشاط تجاري' : 'ملف مهني'} · طلب التحقق <bdi>{item.requestId}</bdi></p>
              {summary?.entityType === 'business' ? <div><p>{summary.categoryCode} · {summary.cityCode}</p>{summary.descriptionAr && <p>{summary.descriptionAr}</p>}{summary.descriptionEn && <p dir="ltr">{summary.descriptionEn}</p>}<p><bdi>{summary.phone || 'لا يوجد هاتف'}</bdi> · <bdi>{summary.email || 'لا يوجد بريد'}</bdi></p>{summary.website && <p><bdi>{summary.website}</bdi></p>}{summary.addressAr && <p>{summary.addressAr}</p>}</div> : summary?.entityType === 'professional' ? <div><p>{summary.cityCode} · {summary.countryCode} · {summary.skills.join('، ')}</p>{summary.headlineEn && <p dir="ltr">{summary.headlineEn}</p>}{summary.bioAr && <p>{summary.bioAr}</p>}{summary.bioEn && <p dir="ltr">{summary.bioEn}</p>}</div> : <p className="moderation-feedback error" role="alert">ملخص الملف مفقود أو غير مطابق. حدّث الطابور ولا تعتمد الطلب.</p>}
              <p><small>تاريخ الطلب: {new Date(item.createdAt).toLocaleString('ar-SY')}</small></p>
              <p><small>نسخة الملف للمراجعة: <bdi>{item.profileRevision}</bdi></small></p>
              {dataReady ? <div><strong>صور الإثبات الخاصة ({evidence.length})</strong><ul>{evidence.map((proof, index) => <li key={proof.id}><a href={proof.secureUrl} target="_blank" rel="noopener noreferrer">فتح صورة الإثبات {index + 1}: {proof.filename}</a> · {(proof.sizeBytes / 1024).toLocaleString('ar-SY-u-nu-latn', { maximumFractionDigits: 0 })} KB</li>)}</ul></div> : <p className="moderation-feedback error" role="alert">بيانات الملف أو مجموعة صور الإثبات مفقودة أو غير صالحة أو تتجاوز الحد الأقصى. لا تعتمد الطلب قبل تصحيحها وتحديث الطابور.</p>}
            </div>
            <div className="moderation-actions">
              <button type="button" disabled={actionLoading || !dataReady} className="moderation-approve" onClick={() => openDialog(item, 'approved')}>اعتماد التحقق</button>
              {hasSecurityAuthority && <button type="button" disabled={actionLoading} className="moderation-reject" onClick={() => openDialog(item, 'rejected')}>رفض التحقق</button>}
            </div>
          </article>; })}</div>}
    </section>}

    {dialog && <div className="moderation-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeDialog(); }}>
      <section className="moderation-dialog" role="dialog" aria-modal="true" aria-labelledby="verification-dialog-title" aria-describedby="verification-dialog-description">
        <h3 id="verification-dialog-title">{dialog.item.label}</h3>
        <p id="verification-dialog-description">{dialog.decision === 'approved' ? 'سجّل الأدلة التي راجعتها قبل اعتماد التحقق. هذا القرار لا يعتمد مراجعة المحتوى تلقائيًا.' : 'اكتب سبب رفض التحقق بوضوح ليبقى القرار قابلًا للتدقيق.'}</p>
        {dialog.decision === 'approved' && <ul>{reviewEvidence(dialog.item).map((evidence, index) => <li key={evidence.id}><a href={evidence.secureUrl} target="_blank" rel="noopener noreferrer">فتح صورة الإثبات {index + 1}: {evidence.filename}</a></li>)}</ul>}
        <textarea rows={5} autoFocus className="moderation-reason" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="ملاحظة المراجع (10 أحرف على الأقل)…" />
        <div className="moderation-actions">
          <button type="button" disabled={actionLoading} onClick={closeDialog}>إلغاء</button>
          <button type="button" disabled={actionLoading || notes.trim().length < noteMinimum} onClick={() => void executeDecision()} className={dialog.decision === 'approved' ? 'moderation-approve' : 'moderation-reject'}>{actionLoading ? 'جارٍ التسجيل…' : 'تأكيد القرار البشري'}</button>
        </div>
      </section>
    </div>}
  </main>;
}
