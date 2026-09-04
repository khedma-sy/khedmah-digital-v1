'use client';

import Link from 'next/link';
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { api, ContactInquiryReceipt } from '../lib/api-client';
import styles from './contact-inquiry-form.module.css';
import { InquirySubmissionGuard } from './inquiry-idempotency';

export type ContactInquiryTarget =
  | { readonly type: 'business'; readonly id: string }
  | { readonly type: 'professional'; readonly id: string };

interface ContactInquiryFormProps {
  readonly target: ContactInquiryTarget;
  readonly providerName: string;
}

type JourneyStage = 'details' | 'contact' | 'receipt';

function inquiryErrorMessage(error: unknown): string {
  const statusCode = error instanceof Error ? (error as Error & { statusCode?: number }).statusCode : undefined;
  if (statusCode === 401) return 'سجّل الدخول أولاً لإرسال طلب الخدمة.';
  if (statusCode === 403) return 'تعذر قبول هذا الطلب. راجع محتواه ثم حاول مرة أخرى.';
  if (statusCode === 404) return 'ملف مقدم الخدمة غير متاح لاستقبال الطلبات حالياً.';
  if (statusCode === 409) return 'تعذر إعادة المحاولة لأن بيانات الطلب تغيّرت. ابدأ استفساراً جديداً.';
  if (statusCode === 429) return 'تم إرسال عدة طلبات خلال وقت قصير. يرجى المحاولة لاحقاً.';
  return 'تعذر إرسال الطلب الآن. لم يتم تسجيل طلبك؛ حاول مرة أخرى.';
}

export function ContactInquiryForm({ target, providerName }: ContactInquiryFormProps) {
  const returnHref = target.type === 'business' ? `/business-profiles/${target.id}` : `/professional-profiles/${target.id}`;
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const submissionGuardRef = useRef(new InquirySubmissionGuard());
  const [isOpen, setIsOpen] = useState(false);
  const [stage, setStage] = useState<JourneyStage>('details');
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<ContactInquiryReceipt | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (stage === 'details') messageInputRef.current?.focus();
    if (stage === 'contact') nameInputRef.current?.focus();
  }, [isOpen, stage]);

  function closeForm() {
    setIsOpen(false);
    setError('');
    requestAnimationFrame(() => openButtonRef.current?.focus());
  }

  function handleEscape(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && stage !== 'receipt') closeForm();
  }

  function continueToContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = message.trim();
    if (normalized.length < 10 || normalized.length > 2000) {
      setError('اكتب تفاصيل الطلب بين 10 و2000 حرف.');
      messageInputRef.current?.focus();
      return;
    }
    setMessage(normalized);
    setError('');
    setStage('contact');
  }

  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const idempotencyKey = submissionGuardRef.current.begin();
    if (!idempotencyKey) return;
    setError('');
    setIsSubmitting(true);
    let succeeded = false;
    try {
      const result = await api.contact.submitInquiry(target, {
        name: name.trim(), contactEmail: contactEmail.trim(), message
      }, idempotencyKey);
      setReceipt(result.inquiry);
      setStage('receipt');
      succeeded = true;
    } catch (submissionError) {
      setError(inquiryErrorMessage(submissionError));
      nameInputRef.current?.focus();
    } finally {
      setIsSubmitting(false);
      submissionGuardRef.current.finish(succeeded);
    }
  }

  function newJourney() {
    setName(''); setContactEmail(''); setMessage(''); setReceipt(null); setError('');
    setStage('details');
    submissionGuardRef.current.newJourney();
  }

  return <div className={styles.experience} onKeyDown={handleEscape}>
    <button ref={openButtonRef} type="button" className={styles.primaryButton} onClick={() => setIsOpen(true)} aria-expanded={isOpen} aria-controls="contact-inquiry-panel">اطلب الخدمة</button>
    {isOpen && <section id="contact-inquiry-panel" className={styles.panel} aria-labelledby="inquiry-title">
      {stage === 'receipt' && receipt ? <div className={styles.success} role="status" aria-live="polite">
        <span className={styles.successIcon} aria-hidden="true">✓</span><div>
          <p className={styles.kicker}>REF-013 · تم تسجيل الاستفسار</p>
          <h2 id="inquiry-title">تم إرسال طلبك بنجاح</h2>
          <p>وصل استفسارك إلى {providerName}. لا يُعد الإرسال تأكيداً للحجز أو موعداً لتقديم الخدمة.</p>
          <p className={styles.receipt}>رقم المتابعة: <bdi>{receipt.id}</bdi></p>
          <p className={styles.receipt}>نوع مقدم الخدمة: <bdi>{receipt.targetType}</bdi></p>
          <p className={styles.receipt}>معرّف مقدم الخدمة: <bdi>{receipt.professionalProfileId ?? receipt.businessProfileId}</bdi></p>
          <p className={styles.receipt}>وقت التسجيل: <time dateTime={receipt.createdAt}>{new Date(receipt.createdAt).toLocaleString('ar-SY-u-nu-latn')}</time></p>
          <p className={styles.receipt}>الحالة: {receipt.trackingStatus}</p>
          <div className={styles.successActions}>
            <button type="button" className={styles.secondaryButton} onClick={newJourney}>إرسال استفسار آخر</button>
            <Link className={styles.textButton} href={returnHref}>العودة إلى ملف مقدم الخدمة</Link>
          </div>
        </div>
      </div> : <>
        <header className={styles.heading}><div>
          <p className={styles.kicker}>{stage === 'details' ? 'REF-011 · تفاصيل الطلب' : 'REF-012 · بيانات التواصل'}</p>
          <h2 id="inquiry-title">اطلب الخدمة من {providerName}</h2>
          <p>{stage === 'details' ? 'اشرح احتياجك بوضوح قبل الانتقال إلى بيانات التواصل.' : 'أدخل الاسم وبريد الرد لإرسال الاستفسار النهائي.'}</p>
        </div><button type="button" className={styles.closeButton} onClick={closeForm} aria-label="إلغاء وإغلاق طلب الخدمة">×</button></header>
        {stage === 'details' ? <form className={styles.form} onSubmit={continueToContact}>
          <label htmlFor={`inquiry-message-${target.type}`}>ما الخدمة التي تحتاجها؟</label>
          <textarea ref={messageInputRef} id={`inquiry-message-${target.type}`} value={message} onChange={(e) => setMessage(e.target.value)} minLength={10} maxLength={2000} rows={5} aria-invalid={!!error} required />
          <p className={styles.help}>اكتب 10 أحرف على الأقل، وتجنب إدخال كلمات المرور أو البيانات الحساسة.</p>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button type="submit" className={styles.primaryButton}>متابعة</button>
        </form> : <form className={styles.form} onSubmit={submitContact} aria-busy={isSubmitting}>
          <label htmlFor={`inquiry-name-${target.type}`}>الاسم</label>
          <input ref={nameInputRef} id={`inquiry-name-${target.type}`} value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={120} autoComplete="name" aria-invalid={!!error} required />
          <label htmlFor={`inquiry-email-${target.type}`}>البريد الإلكتروني للرد</label>
          <input id={`inquiry-email-${target.type}`} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" minLength={3} maxLength={254} autoComplete="email" dir="ltr" required />
          <p className={styles.privacy}>تُستخدم بياناتك لهذا الاستفسار فقط، ولن تظهر علناً.</p>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.successActions}>
            <button type="button" className={styles.secondaryButton} onClick={() => { setError(''); setStage('details'); }}>رجوع إلى التفاصيل</button>
            <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>{isSubmitting ? 'جارٍ إرسال الطلب…' : 'إرسال طلب الخدمة'}</button>
          </div>
        </form>}
      </>}
    </section>}
  </div>;
}
