'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, type PublicBusinessProfile } from '../../lib/api-client';
import { useSyrianCities } from '../../lib/use-syrian-cities';
import { ActionButton, ActionLink, PageHeader, PageShell, StatusMessage, Surface } from '../components/ui-primitives';
import styles from '../taxi/taxi.module.css';

type DriverDocumentType = 'driver_photo' | 'identity_card' | 'driving_license' | 'vehicle_license';
type DriverDocumentReview = {
  id: string;
  businessProfileId: string;
  documentType: DriverDocumentType;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  reviewReason?: string;
  reviewedAt?: string;
  createdAt: string;
  secureUrl: string;
};

const DOCUMENTS: Array<{ type: DriverDocumentType; label: string; help: string }> = [
  { type: 'driver_photo', label: 'صورة السائق', help: 'صورة واضحة وحديثة لصاحب الطلب.' },
  { type: 'identity_card', label: 'الهوية', help: 'صورة واضحة لوثيقة الهوية.' },
  { type: 'driving_license', label: 'رخصة القيادة', help: 'رخصة قيادة سارية وواضحة.' },
  { type: 'vehicle_license', label: 'رخصة المركبة', help: 'وثيقة المركبة التي ستعمل على خدمة تكسي.' },
];
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

function fileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الملف.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const raw = (body as { message?: string | string[] }).message;
    const message = Array.isArray(raw) ? raw.join('. ') : raw || `تعذر إكمال الطلب (${response.status}).`;
    throw Object.assign(new Error(message), { statusCode: response.status });
  }
  return body as T;
}

async function listDocuments(businessId: string) {
  return responseJson<{ documents: DriverDocumentReview[] }>(await fetch(`/api/v1/driver-documents/business/${encodeURIComponent(businessId)}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  }));
}

async function uploadDocument(businessId: string, documentType: DriverDocumentType, file: File) {
  const content = await fileContent(file);
  return responseJson(await fetch('/api/v1/media', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ownerType: 'business_profile',
      ownerId: businessId,
      visibility: 'private',
      assetType: documentType,
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      content,
      sortOrder: 0,
    }),
  }));
}

export default function TaxiDriverSignupPage() {
  const { cities, isLoading: citiesLoading, error: citiesError, retry: retryCities } = useSyrianCities();
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [documents, setDocuments] = useState<DriverDocumentReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', cityCode: '' });
  const createRequestId = useRef<string | undefined>(undefined);

  const taxiBusinesses = useMemo(() => businesses.filter((item) => item.categoryCode === 'taxi'), [businesses]);
  const selected = taxiBusinesses.find((item) => item.id === selectedId);
  const latestByType = useMemo(() => {
    const latest = new Map<DriverDocumentType, DriverDocumentReview>();
    for (const document of documents) if (!latest.has(document.documentType)) latest.set(document.documentType, document);
    return latest;
  }, [documents]);
  const approvedCount = DOCUMENTS.filter((item) => latestByType.get(item.type)?.reviewStatus === 'approved').length;
  const allDocumentsApproved = approvedCount === DOCUMENTS.length;

  async function loadProfiles(preferredId?: string) {
    setLoading(true); setError('');
    try {
      const { businesses: owned } = await api.businesses.listMine();
      setBusinesses(owned);
      const taxiOwned = owned.filter((item) => item.categoryCode === 'taxi');
      const next = preferredId && taxiOwned.some((item) => item.id === preferredId)
        ? preferredId
        : selectedId && taxiOwned.some((item) => item.id === selectedId)
          ? selectedId
          : taxiOwned[0]?.id ?? '';
      setSelectedId(next);
      if (next) {
        const result = await listDocuments(next);
        setDocuments(result.documents);
      } else setDocuments([]);
    } catch (cause) {
      const status = (cause as Error & { statusCode?: number })?.statusCode;
      setError(status === 401 ? 'يلزم تسجيل الدخول قبل الانضمام كسائق.' : cause instanceof Error ? cause.message : 'تعذر تحميل طلب الانضمام.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadProfiles(); }, []);

  async function changeBusiness(id: string) {
    setSelectedId(id); setDocuments([]); setError(''); setNotice('');
    if (!id) return;
    setBusy('documents');
    try { setDocuments((await listDocuments(id)).documents); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحميل وثائق السائق.'); }
    finally { setBusy(''); }
  }

  async function createTaxiProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || citiesLoading || citiesError || !form.name.trim() || !form.cityCode) return;
    setBusy('create'); setError(''); setNotice('');
    try {
      createRequestId.current ??= crypto.randomUUID();
      const { business } = await api.businesses.create({
        clientRequestId: createRequestId.current,
        name: form.name.trim(),
        descriptionAr: 'طلب انضمام إلى خدمة تكسي كسائق ومركبة.',
        phone: form.phone.trim() || undefined,
        categoryCode: 'taxi',
        cityCode: form.cityCode,
        countryCode: 'SY',
      });
      createRequestId.current = undefined;
      setForm({ name: '', phone: '', cityCode: '' });
      setNotice('تم إنشاء ملف طلب التكسي كملف خاص. أكمل المستندات المطلوبة للمراجعة.');
      await loadProfiles(business.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إنشاء ملف الانضمام إلى خدمة تكسي.');
    } finally { setBusy(''); }
  }

  async function submitDocument(event: FormEvent<HTMLFormElement>, documentType: DriverDocumentType) {
    event.preventDefault();
    if (!selectedId || busy) return;
    const input = event.currentTarget.elements.namedItem('document') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) { setError('اختر صورة الوثيقة أولاً.'); return; }
    if (!ALLOWED_TYPES.includes(file.type as typeof ALLOWED_TYPES[number])) { setError('الوثائق المقبولة: JPG أو PNG أو WebP فقط.'); return; }
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) { setError('حجم الوثيقة يجب ألا يتجاوز 5 ميغابايت.'); return; }
    setBusy(documentType); setError(''); setNotice('');
    try {
      await uploadDocument(selectedId, documentType, file);
      input.value = '';
      setDocuments((await listDocuments(selectedId)).documents);
      setNotice('تم رفع الوثيقة بشكل خاص وإرسالها لمسار المراجعة.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر رفع الوثيقة.');
    } finally { setBusy(''); }
  }

  if (loading) return <PageShell className={styles.page} label="الانضمام إلى خدمة تكسي"><StatusMessage>جاري تحميل طلب الانضمام…</StatusMessage></PageShell>;

  return <PageShell className={styles.page} label="الانضمام إلى خدمة تكسي">
    <PageHeader
      eyebrow="خدمة — تكسي"
      title="سجّل سيارتك مع خدمة"
      description="خدمة تربط السائقين المعتمدين بالعملاء. إنشاء الحساب أو امتلاك السيارة لا يفعّل السائق تلقائياً؛ يلزم اكتمال الوثائق والمراجعة ثم اعتماد السائق والمركبة تشغيلياً."
      backHref="/taxi?mode=driver"
    />

    {error && <StatusMessage tone="danger">{error}{error.includes('تسجيل الدخول') && <div className={styles.actions}><ActionLink href="/auth/login?next=%2Ftaxi-driver-signup">تسجيل الدخول</ActionLink></div>}</StatusMessage>}
    {notice && <StatusMessage tone="success">{notice}</StatusMessage>}

    <div className={styles.grid}>
      <Surface className={styles.panel}>
        <h2>١. ملف السائق في خدمة</h2>
        {taxiBusinesses.length > 0 ? <>
          <label>اختر ملف التكسي
            <select value={selectedId} onChange={(event) => void changeBusiness(event.target.value)} disabled={!!busy}>
              {taxiBusinesses.map((business) => <option key={business.id} value={business.id}>{business.name} · {business.cityCode}</option>)}
            </select>
          </label>
          {selected && <p className={styles.note}>الحالة: {selected.moderationStatus === 'approved' ? 'معتمد' : selected.moderationStatus === 'rejected' ? 'مطلوب تعديل' : 'قيد المراجعة'} · الملف {selected.visibility === 'public' ? 'منشور' : 'خاص'}.</p>}
          <div className={styles.actions}><ActionLink href={`/business-profiles/${encodeURIComponent(selectedId)}/manage`} variant="secondary">إدارة الملف</ActionLink></div>
        </> : <form onSubmit={createTaxiProfile}>
          <p className={styles.note}>أنشئ ملف Taxi خاصاً أولاً. لن يظهر للعامة قبل المراجعة.</p>
          <div className={styles.fields}>
            <label>اسم السائق / اسم الملف<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} minLength={2} maxLength={160} required /></label>
            <label>رقم الهاتف<input type="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+963…" /></label>
            <label>المدينة<select value={form.cityCode} onChange={(event) => setForm((current) => ({ ...current, cityCode: event.target.value }))} disabled={citiesLoading || !!citiesError} required><option value="">اختر المدينة</option>{cities.map((city) => <option value={city.code} key={city.code}>{city.nameAr}</option>)}</select></label>
          </div>
          {citiesError && <StatusMessage tone="warning">{citiesError}<ActionButton type="button" variant="secondary" onClick={() => void retryCities()}>إعادة تحميل المدن</ActionButton></StatusMessage>}
          <ActionButton type="submit" disabled={busy === 'create' || citiesLoading || !!citiesError}>{busy === 'create' ? 'جارٍ إنشاء الملف…' : 'إنشاء ملف التكسي'}</ActionButton>
        </form>}
      </Surface>

      <Surface className={styles.panel}>
        <h2>٢. الوثائق المطلوبة</h2>
        {!selectedId ? <p className={styles.note}>أنشئ ملف التكسي أولاً لرفع الوثائق.</p> : <>
          <p className={styles.note}>المستندات خاصة ولا تُعرض في الملف العام. المعتمد حالياً: {approvedCount.toLocaleString('ar-SY')} من {DOCUMENTS.length.toLocaleString('ar-SY')}.</p>
          <div className={styles.offerList}>
            {DOCUMENTS.map((definition) => {
              const document = latestByType.get(definition.type);
              return <Surface key={definition.type} className={styles.offer}>
                <div className={styles.offerHeader}><div><strong>{definition.label}</strong><p className={styles.note}>{definition.help}</p></div><span className={styles.phase}>{document?.reviewStatus === 'approved' ? 'معتمد' : document?.reviewStatus === 'rejected' ? 'مرفوض' : document ? 'قيد المراجعة' : 'غير مرفوع'}</span></div>
                {document?.reviewReason && <StatusMessage tone="warning">سبب المراجعة: {document.reviewReason}</StatusMessage>}
                {document?.reviewStatus !== 'approved' && <form onSubmit={(event) => void submitDocument(event, definition.type)}>
                  <label>رفع {definition.label}<input name="document" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
                  <ActionButton type="submit" variant="secondary" disabled={!!busy}>{busy === definition.type ? 'جارٍ الرفع…' : document?.reviewStatus === 'rejected' ? 'رفع نسخة مصححة' : 'رفع الوثيقة'}</ActionButton>
                </form>}
              </Surface>;
            })}
          </div>
        </>}
      </Surface>
    </div>

    <Surface className={styles.panel}>
      <h2>٣. المراجعة ثم التفعيل التشغيلي</h2>
      {allDocumentsApproved
        ? <StatusMessage tone="success">اكتملت موافقة المستندات الأربعة. الخطوة التالية هي اعتماد السائق والمركبة والمنطقة داخل محرك Taxi قبل استقبال أي طلب رحلة.</StatusMessage>
        : <StatusMessage tone="info">لن تصل طلبات العملاء إلى هذا الحساب قبل اكتمال المستندات واعتماد السائق والمركبة تشغيلياً.</StatusMessage>}
      <p className={styles.note}>هذه الصفحة لا تمنح نفسها صلاحية القيادة، ولا تنشئ موافقة تشغيلية تلقائياً. التفعيل النهائي يبقى صلاحية مستقلة لخدمة.</p>
      <div className={styles.actions}><ActionLink href="/taxi?mode=driver">العودة لمساحة السائق</ActionLink><ActionLink href="/taxi" variant="secondary">واجهة العميل</ActionLink></div>
    </Surface>
  </PageShell>;
}
