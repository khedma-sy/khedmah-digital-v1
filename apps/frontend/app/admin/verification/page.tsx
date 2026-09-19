'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { verificationReviewApi, type VerificationDecision, type VerificationReviewItem } from '../../../lib/verification-review-client';

type ReviewDialog = { item: VerificationReviewItem; decision: VerificationDecision };
const noteMinimum = 10;
const messageFor = (value: unknown, fallback: string) => value instanceof Error ? value.message : fallback;
const statusCodeFor = (value: unknown) => value && typeof value === 'object' && 'statusCode' in value ? value.statusCode : undefined;

export default function VerificationReviewPage() {
  const [requests, setRequests] = useState<VerificationReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
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
    try {
      const result = await verificationReviewApi.pending();
      if (request !== queueSequence.current) return;
      setRequests(result.requests);
      setError('');
    } catch (cause) {
      if (request === queueSequence.current) setError(messageFor(cause, 'تعذر تحميل طلبات التحقق.'));
    } finally {
      if (request === queueSequence.current) setLoading(false);
    }
  }

  useEffect(() => { void loadQueue(); }, []);

  function openDialog(item: VerificationReviewItem, decision: VerificationDecision) {
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
      <Link href="/admin/moderation">مراجعة المحتوى والبلاغات</Link>
      <Link href="/admin/verification" aria-current="page">التحقق</Link>
    </nav>

    <section className="operations-panel">
      <h2>حدود القرار</h2>
      <p>اعتماد تحقق النشاط التجاري يمكن أن يعتمد حالة الثقة فقط، ولا يعتمد محتوى النشاط. اعتماد تحقق المهني يسجل نتيجة التحقق فقط ولا يغيّر حالة مراجعة المحتوى أو دورة حياة الملف أو النشر.</p>
    </section>

    {error && <p className="moderation-feedback error" role="alert">{error} <button type="button" disabled={actionLoading} onClick={() => void loadQueue()}>إعادة المحاولة</button></p>}
    {feedback && <p className={`moderation-feedback ${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}

    {!error && <section className="operations-panel moderation-section" aria-labelledby="verification-queue-title">
      <div className="panel-heading"><h2 id="verification-queue-title">طلبات التحقق المعلقة</h2><span>{requests.length}</span></div>
      {requests.length === 0
        ? <p className="moderation-empty">لا توجد طلبات تحقق بانتظار المراجعة.</p>
        : <div className="moderation-list">{requests.map((item) => <article className="moderation-card" key={item.requestId}>
            <div>
              <h3>{item.label}</h3>
              <p>{item.entityType === 'business' ? 'نشاط تجاري' : 'ملف مهني'} · طلب التحقق <bdi>{item.requestId}</bdi></p>
              <p><small>تاريخ الطلب: {new Date(item.createdAt).toLocaleString('ar-SY')}</small></p>
              <p><small>نسخة الملف للمراجعة: <bdi>{item.profileRevision}</bdi></small></p>
            </div>
            <div className="moderation-actions">
              <button type="button" disabled={actionLoading} className="moderation-approve" onClick={() => openDialog(item, 'approved')}>اعتماد التحقق</button>
              <button type="button" disabled={actionLoading} className="moderation-reject" onClick={() => openDialog(item, 'rejected')}>رفض التحقق</button>
            </div>
          </article>)}</div>}
    </section>}

    {dialog && <div className="moderation-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeDialog(); }}>
      <section className="moderation-dialog" role="dialog" aria-modal="true" aria-labelledby="verification-dialog-title" aria-describedby="verification-dialog-description">
        <h3 id="verification-dialog-title">{dialog.item.label}</h3>
        <p id="verification-dialog-description">{dialog.decision === 'approved' ? 'سجّل الأدلة التي راجعتها قبل اعتماد التحقق. هذا القرار لا يعتمد مراجعة المحتوى تلقائيًا.' : 'اكتب سبب رفض التحقق بوضوح ليبقى القرار قابلًا للتدقيق.'}</p>
        <textarea rows={5} autoFocus className="moderation-reason" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="ملاحظة المراجع (10 أحرف على الأقل)…" />
        <div className="moderation-actions">
          <button type="button" disabled={actionLoading} onClick={closeDialog}>إلغاء</button>
          <button type="button" disabled={actionLoading || notes.trim().length < noteMinimum} onClick={() => void executeDecision()} className={dialog.decision === 'approved' ? 'moderation-approve' : 'moderation-reject'}>{actionLoading ? 'جارٍ التسجيل…' : 'تأكيد القرار البشري'}</button>
        </div>
      </section>
    </div>}
  </main>;
}
