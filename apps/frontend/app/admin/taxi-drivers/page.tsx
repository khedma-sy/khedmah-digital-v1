'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  taxiOperationalReviewApi,
  type TaxiDocumentStatus,
  type TaxiDocumentType,
  type TaxiDriverDocument,
  type TaxiOperationalCandidate
} from '../../../lib/taxi-operational-review-client';
import styles from './taxi-drivers.module.css';

const documentTypes: TaxiDocumentType[] = ['driver_photo', 'identity_card', 'driving_license', 'vehicle_license'];
const documentLabels: Record<TaxiDocumentType, string> = {
  driver_photo: 'صورة السائق',
  identity_card: 'الهوية الشخصية',
  driving_license: 'رخصة القيادة',
  vehicle_license: 'رخصة المركبة'
};
const documentStatusLabels: Record<TaxiDocumentStatus, string> = {
  missing: 'غير مرفوع',
  pending: 'بانتظار المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض'
};
const operationalLabels = {
  approved: 'معتمد تشغيليًا',
  suspended: 'معلّق',
  revoked: 'ملغى'
} as const;

type OperationalDialog = {
  candidate: TaxiOperationalCandidate;
  action: 'approve' | 'suspend' | 'revoke';
};
type DocumentDialog = {
  document: TaxiDriverDocument;
  decision: 'approved' | 'rejected';
};

const errorStatus = (value: unknown) => value instanceof Error
  ? (value as Error & { statusCode?: number }).statusCode
  : undefined;
const errorMessage = (value: unknown, fallback: string) => value instanceof Error ? value.message : fallback;

export default function TaxiDriversAdminPage() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<TaxiOperationalCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [selected, setSelected] = useState<TaxiOperationalCandidate | null>(null);
  const [documents, setDocuments] = useState<TaxiDriverDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentDialog, setDocumentDialog] = useState<DocumentDialog | null>(null);
  const [documentReason, setDocumentReason] = useState('');
  const [operationalDialog, setOperationalDialog] = useState<OperationalDialog | null>(null);
  const [zoneCode, setZoneCode] = useState('');
  const [verificationReference, setVerificationReference] = useState('');
  const [decisionReason, setDecisionReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const requestSequence = useRef(0);
  const actionInFlight = useRef(false);

  const loadCandidates = useCallback(async () => {
    const request = ++requestSequence.current;
    setLoading(true);
    try {
      const result = await taxiOperationalReviewApi.candidates();
      if (request !== requestSequence.current) return;
      setCandidates(result);
      setError('');
      setSelected((current) => current ? result.find((candidate) => candidate.businessProfileId === current.businessProfileId) ?? null : null);
    } catch (cause) {
      if (request !== requestSequence.current) return;
      const status = errorStatus(cause);
      if (status === 401) {
        router.replace('/auth/login?next=%2Fadmin%2Ftaxi-drivers');
        return;
      }
      setError(status === 403 ? 'هذا الحساب لا يملك صلاحية مراجعة واعتماد سائقي التكسي.' : errorMessage(cause, 'تعذر تحميل طابور سائقي التكسي.'));
    } finally {
      if (request === requestSequence.current) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadCandidates();
    return () => { requestSequence.current += 1; };
  }, [loadCandidates]);

  const metrics = useMemo(() => ({
    total: candidates.length,
    documentsReady: candidates.filter((candidate) => candidate.documentsApproved).length,
    readyForApproval: candidates.filter((candidate) => candidate.documentsApproved && candidate.profileReady && candidate.operationalStatus !== 'approved').length,
    operational: candidates.filter((candidate) => candidate.operationalStatus === 'approved').length
  }), [candidates]);

  const latestDocuments = useMemo(() => documentTypes.flatMap((type) => {
    const matching = documents
      .filter((document) => document.documentType === type)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return matching[0] ? [matching[0]] : [];
  }), [documents]);

  async function openDocuments(candidate: TaxiOperationalCandidate) {
    if (saving) return;
    setSelected(candidate);
    setDocuments([]);
    setDocumentsLoading(true);
    setFeedback('');
    try {
      const result = await taxiOperationalReviewApi.documents(candidate.businessProfileId);
      setDocuments(result.documents);
    } catch (cause) {
      setFeedback(errorMessage(cause, 'تعذر تحميل مستندات السائق.'));
    } finally {
      setDocumentsLoading(false);
    }
  }

  function openDocumentDecision(document: TaxiDriverDocument, decision: 'approved' | 'rejected') {
    if (saving) return;
    setDocumentReason('');
    setDocumentDialog({ document, decision });
  }

  async function saveDocumentDecision() {
    if (!documentDialog || actionInFlight.current) return;
    if (documentDialog.decision === 'rejected' && documentReason.trim().length < 5) return;
    actionInFlight.current = true;
    setSaving(true);
    setFeedback('');
    try {
      await taxiOperationalReviewApi.reviewDocument(
        documentDialog.document.id,
        documentDialog.decision,
        documentDialog.decision === 'rejected' ? documentReason.trim() : undefined
      );
      const activeBusinessId = documentDialog.document.businessProfileId;
      setDocumentDialog(null);
      setDocumentReason('');
      await loadCandidates();
      const result = await taxiOperationalReviewApi.documents(activeBusinessId);
      setDocuments(result.documents);
      setFeedback('تم تسجيل قرار المستند وتحديث جاهزية السائق.');
    } catch (cause) {
      setFeedback(errorMessage(cause, 'تعذر تسجيل قرار المستند.'));
    } finally {
      actionInFlight.current = false;
      setSaving(false);
    }
  }

  function openOperationalDecision(candidate: TaxiOperationalCandidate, action: OperationalDialog['action']) {
    if (saving) return;
    setOperationalDialog({ candidate, action });
    setZoneCode(candidate.zoneCode ?? candidate.cityCode ?? '');
    setVerificationReference('');
    setDecisionReason('');
    setExpiresAt('');
    setFeedback('');
  }

  function resetOperationalDialog() {
    setOperationalDialog(null);
    setZoneCode('');
    setVerificationReference('');
    setDecisionReason('');
    setExpiresAt('');
  }

  function closeOperationalDialog() {
    if (saving) return;
    resetOperationalDialog();
  }

  async function saveOperationalDecision() {
    if (!operationalDialog || actionInFlight.current) return;
    const reference = verificationReference.trim();
    const reason = decisionReason.trim();
    if (reference.length < 5 || reason.length < 10) return;
    actionInFlight.current = true;
    setSaving(true);
    setFeedback('');
    try {
      const { candidate, action } = operationalDialog;
      if (action === 'approve') {
        if (!candidate.profileReady || !candidate.documentsApproved || !zoneCode.trim() || !expiresAt) return;
        const expiry = new Date(expiresAt);
        if (!Number.isFinite(expiry.getTime())) throw new Error('تاريخ انتهاء الاعتماد غير صالح.');
        await taxiOperationalReviewApi.approve(candidate.businessProfileId, {
          zoneCode: zoneCode.trim(),
          verificationReference: reference,
          reason,
          expiresAt: expiry.toISOString()
        });
      } else {
        await taxiOperationalReviewApi.restrict(candidate.businessProfileId, action, {
          verificationReference: reference,
          reason
        });
      }
      resetOperationalDialog();
      await loadCandidates();
      setFeedback(action === 'approve'
        ? 'تم اعتماد السائق والسيارة والمنطقة تشغيليًا. تشغيل الرحلات يبقى منفصلًا عن هذا القرار.'
        : action === 'suspend' ? 'تم تعليق الاعتماد التشغيلي للسائق والسيارة.' : 'تم إلغاء الاعتماد التشغيلي للسائق والسيارة.');
    } catch (cause) {
      const status = errorStatus(cause);
      if (status === 409) {
        resetOperationalDialog();
        await loadCandidates();
        setFeedback('تغيرت حالة الملف أثناء المراجعة. تم تحديث الطابور؛ راجع الحالة الحالية قبل قرار جديد.');
      } else setFeedback(errorMessage(cause, 'تعذر تسجيل القرار التشغيلي.'));
    } finally {
      actionInFlight.current = false;
      setSaving(false);
    }
  }

  const approvalValid = operationalDialog?.action !== 'approve'
    ? verificationReference.trim().length >= 5 && decisionReason.trim().length >= 10
    : !!operationalDialog.candidate.profileReady && !!operationalDialog.candidate.documentsApproved
      && !!zoneCode.trim() && !!expiresAt && verificationReference.trim().length >= 5 && decisionReason.trim().length >= 10;

  if (loading) return <main id="foundation-content" className="operations-shell" aria-busy="true"><section className="operations-panel"><p>جاري تحميل طابور سائقي التكسي…</p></section></main>;

  return <main id="foundation-content" className={`operations-shell ${styles.page}`} dir="rtl" aria-label="إدارة سائقي التكسي">
    <header className="operations-header">
      <div><p className="eyebrow">خدمة · Taxi Operations</p><h1>اعتماد سائقي خدمة تكسي</h1><p>مراجعة المستندات ثم اعتماد السائق والسيارة والمنطقة. الاعتماد التشغيلي لا يفعّل رحلات التكسي تلقائيًا.</p></div>
      <span className="status-badge">{metrics.readyForApproval} جاهز للاعتماد</span>
    </header>

    <nav className="admin-navigation" aria-label="التنقل الإداري">
      <Link href="/admin">لوحة الإدارة</Link>
      <Link href="/admin/moderation">المراجعة</Link>
      <Link href="/admin/verification">التحقق</Link>
      <Link href="/admin/taxi-drivers" aria-current="page">سائقو التكسي</Link>
    </nav>

    <section className={styles.summary} aria-label="ملخص سائقي التكسي">
      <article className={styles.metric}><strong>{metrics.total}</strong><span>ملفات تكسي</span></article>
      <article className={styles.metric}><strong>{metrics.documentsReady}</strong><span>وثائق 4/4 معتمدة</span></article>
      <article className={styles.metric}><strong>{metrics.readyForApproval}</strong><span>جاهز لقرار التشغيل</span></article>
      <article className={styles.metric}><strong>{metrics.operational}</strong><span>معتمد تشغيليًا</span></article>
    </section>

    <section className="operations-panel">
      <h2>حدود التشغيل الحالية</h2>
      <p>هذه الشاشة تمنح أو تعلق أو تلغي سلطة السائق والسيارة والمنطقة فقط. استقبال الرحلات والـdispatch يظلان خلف بوابة تشغيل مستقلة حتى اعتماد طبقة الرحلات والإثباتات الموثوقة.</p>
    </section>

    {error && <p className="moderation-feedback error" role="alert">{error} <button type="button" onClick={() => void loadCandidates()}>إعادة المحاولة</button></p>}
    {feedback && <p className="moderation-feedback success" role="status">{feedback}</p>}

    {!error && <section className="operations-panel moderation-section" aria-labelledby="taxi-driver-queue-title">
      <div className="panel-heading"><h2 id="taxi-driver-queue-title">طابور ملفات التكسي</h2><span>{candidates.length}</span></div>
      {candidates.length === 0 ? <p className={styles.empty}>لا توجد ملفات تكسي بانتظار أو تحت الاعتماد حاليًا.</p> : <div className="moderation-list">
        {candidates.map((candidate) => {
          const canApprove = candidate.profileReady && candidate.documentsApproved;
          return <article className="moderation-card" key={candidate.businessProfileId}>
            <div>
              <h3>{candidate.name}</h3>
              <p>{candidate.cityCode} · ملف <bdi>{candidate.businessProfileId}</bdi></p>
              <div className={styles.identity}>
                <span>النشر: {candidate.visibility}</span>
                <span>المراجعة: {candidate.moderationStatus}</span>
                <span>الثقة: {candidate.trustStatus}</span>
                <span>النشاط: {candidate.businessStatus}</span>
              </div>
              <div className={styles.readiness} aria-label={`جاهزية ${candidate.name}`}>
                {documentTypes.map((type) => <div key={type} className={`${styles.check} ${candidate.documents[type] === 'approved' ? styles.ok : styles.blocked}`}>
                  <strong>{documentLabels[type]}</strong><span>{documentStatusLabels[candidate.documents[type]]}</span>
                </div>)}
              </div>
              <p className={styles.opsStatus}>الحالة التشغيلية: {candidate.operationalStatus ? operationalLabels[candidate.operationalStatus] : 'غير معتمد بعد'}{candidate.zoneCode ? ` · ${candidate.zoneCode}` : ''}</p>
              {candidate.expiresAt && <p><small>انتهاء الاعتماد: {new Date(candidate.expiresAt).toLocaleString('ar-SY')}</small></p>}
              {!canApprove && <p className={styles.blocker}>لا يمكن الاعتماد حتى تصبح أحدث الوثائق الأربع معتمدة ويصبح ملف النشاط public + approved moderation + approved trust + active.</p>}
            </div>
            <div className="moderation-actions">
              <button type="button" disabled={saving} onClick={() => void openDocuments(candidate)}>مراجعة المستندات</button>
              <button type="button" className="moderation-approve" disabled={saving || !canApprove} onClick={() => openOperationalDecision(candidate, 'approve')}>{candidate.operationalStatus === 'approved' ? 'تجديد الاعتماد' : 'اعتماد تشغيلي'}</button>
              {candidate.operationalStatus === 'approved' && <button type="button" disabled={saving} onClick={() => openOperationalDecision(candidate, 'suspend')}>تعليق</button>}
              {(candidate.operationalStatus === 'approved' || candidate.operationalStatus === 'suspended') && <button type="button" className="moderation-reject" disabled={saving} onClick={() => openOperationalDecision(candidate, 'revoke')}>إلغاء الاعتماد</button>}
            </div>
          </article>;
        })}
      </div>}
    </section>}

    {selected && <section className="operations-panel moderation-section" aria-labelledby="taxi-documents-title">
      <div className="panel-heading"><h2 id="taxi-documents-title">أحدث مستندات: {selected.name}</h2><span>{latestDocuments.length}/4 مرفوع</span></div>
      {documentsLoading ? <p>جاري تحميل المستندات الخاصة…</p> : <div className={styles.documents}>
        {documentTypes.map((type) => {
          const document = latestDocuments.find((item) => item.documentType === type);
          if (!document) return <article className={styles.document} key={type}><div><h4>{documentLabels[type]}</h4><p>لم يُرفع مستند حالي من هذا النوع.</p></div><span className={styles.pill} data-state="missing">غير مرفوع</span></article>;
          return <article className={styles.document} key={document.id}>
            <div>
              <h4>{documentLabels[type]}</h4>
              <p>{document.filename} · {(document.sizeBytes / 1024).toLocaleString('ar-SY-u-nu-latn', { maximumFractionDigits: 0 })} KB</p>
              <div className={styles.documentMeta}><span className={styles.pill} data-state={document.reviewStatus}>{documentStatusLabels[document.reviewStatus]}</span><span className={styles.pill}>{new Date(document.createdAt).toLocaleString('ar-SY')}</span></div>
              {document.reviewReason && <p>سبب الرفض: {document.reviewReason}</p>}
            </div>
            <div className="moderation-actions">
              <a href={document.secureUrl} target="_blank" rel="noreferrer">فتح المستند الخاص</a>
              <button type="button" className="moderation-approve" disabled={saving || document.reviewStatus === 'approved'} onClick={() => openDocumentDecision(document, 'approved')}>اعتماد</button>
              <button type="button" className="moderation-reject" disabled={saving} onClick={() => openDocumentDecision(document, 'rejected')}>رفض</button>
            </div>
          </article>;
        })}
      </div>}
    </section>}

    {documentDialog && <div className="moderation-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setDocumentDialog(null); }}>
      <section className="moderation-dialog" role="dialog" aria-modal="true" aria-labelledby="taxi-document-dialog-title">
        <h3 id="taxi-document-dialog-title">{documentLabels[documentDialog.document.documentType]}</h3>
        <p>{documentDialog.decision === 'approved' ? 'أكد أنك فتحت أحدث المستند وراجعته بصريًا قبل اعتماده.' : 'اكتب سبب الرفض بوضوح ليظهر للسائق ويستطيع رفع نسخة مصححة.'}</p>
        {documentDialog.decision === 'rejected' && <textarea className="moderation-reason" rows={5} autoFocus value={documentReason} onChange={(event) => setDocumentReason(event.target.value)} placeholder="سبب الرفض (5 أحرف على الأقل)…" />}
        <div className="moderation-actions"><button type="button" disabled={saving} onClick={() => setDocumentDialog(null)}>إلغاء</button><button type="button" className={documentDialog.decision === 'approved' ? 'moderation-approve' : 'moderation-reject'} disabled={saving || (documentDialog.decision === 'rejected' && documentReason.trim().length < 5)} onClick={() => void saveDocumentDecision()}>{saving ? 'جارٍ التسجيل…' : 'تأكيد القرار'}</button></div>
      </section>
    </div>}

    {operationalDialog && <div className="moderation-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeOperationalDialog(); }}>
      <section className="moderation-dialog" role="dialog" aria-modal="true" aria-labelledby="taxi-operational-dialog-title">
        <h3 id="taxi-operational-dialog-title">{operationalDialog.action === 'approve' ? 'اعتماد السائق والسيارة' : operationalDialog.action === 'suspend' ? 'تعليق الاعتماد' : 'إلغاء الاعتماد'}</h3>
        <p>القرار مرتبط بملف {operationalDialog.candidate.name} ويُسجل في سجل تشغيل append-only.</p>
        <div className={styles.dialogForm}>
          {operationalDialog.action === 'approve' && <><label>رمز منطقة التشغيل<input value={zoneCode} maxLength={80} onChange={(event) => setZoneCode(event.target.value)} placeholder="damascus-central" /></label><label>انتهاء الاعتماد<input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label></>}
          <label>مرجع التحقق<input value={verificationReference} minLength={5} maxLength={200} onChange={(event) => setVerificationReference(event.target.value)} placeholder="رقم قضية أو مرجع مراجعة" /></label>
          <label>سبب القرار<textarea value={decisionReason} minLength={10} maxLength={500} onChange={(event) => setDecisionReason(event.target.value)} placeholder="ما الذي تمت مراجعته ولماذا اتُخذ هذا القرار؟" /></label>
        </div>
        <div className="moderation-actions"><button type="button" disabled={saving} onClick={closeOperationalDialog}>إلغاء</button><button type="button" className={operationalDialog.action === 'revoke' ? 'moderation-reject' : 'moderation-approve'} disabled={saving || !approvalValid} onClick={() => void saveOperationalDecision()}>{saving ? 'جارٍ التسجيل…' : 'تأكيد القرار التشغيلي'}</button></div>
      </section>
    </div>}
  </main>;
}
