'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, ContactInquiryReceipt } from '../../../lib/api-client';
import styles from './contact-inquiry-form.module.css';

interface ContactInquiryFormProps {
  readonly businessProfileId: string;
  readonly businessName: string;
}

type SubmissionState = 'idle' | 'submitting' | 'submitted';

function inquiryErrorMessage(error: unknown): string {
  const statusCode = error instanceof Error
    ? (error as Error & { statusCode?: number }).statusCode
    : undefined;

  if (statusCode === 401) return 'سجّل الدخول أولاً لإرسال طلب الخدمة.';
  if (statusCode === 403) return 'تعذر قبول هذا الطلب. راجع محتواه ثم حاول مرة أخرى.';
  if (statusCode === 404) return 'ملف العمل غير متاح لاستقبال الطلبات حالياً.';
  if (statusCode === 429) return 'تم إرسال عدة طلبات خلال وقت قصير. يرجى المحاولة لاحقاً.';
  return 'تعذر إرسال الطلب الآن. لم يتم تسجيل طلبك؛ حاول مرة أخرى.';
}

export function ContactInquiryForm({ businessProfileId, businessName }: ContactInquiryFormProps) {
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submissionState, setSubmissionState] = useState<SubmissionState>('idle');
  const [receipt, setReceipt] = useState<ContactInquiryReceipt | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) nameInputRef.current?.focus();
  }, [isOpen]);

  function openForm() {
    setError('');
    setIsOpen(true);
  }

  function closeForm() {
    setIsOpen(false);
    requestAnimationFrame(() => openButtonRef.current?.focus());
  }

  function resetForm() {
    setName('');
    setContactEmail('');
    setMessage('');
    setReceipt(null);
    setError('');
    setSubmissionState('idle');
    requestAnimationFrame(() => nameInputRef.current?.focus());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionState === 'submitting') return;

    setError('');
    setSubmissionState('submitting');

    try {
      const result = await api.businesses.submitInquiry(businessProfileId, {
        name: name.trim(),
        contactEmail: contactEmail.trim(),
        message: message.trim()
      });
      setReceipt(result.inquiry);
      setSubmissionState('submitted');
    } catch (submissionError) {
      setError(inquiryErrorMessage(submissionError));
      setSubmissionState('idle');
    }
  }

  return (
    <div className={styles.experience}>
      <button ref={openButtonRef} type="button" className={styles.primaryButton} onClick={openForm} aria-expanded={isOpen} aria-controls="contact-inquiry-panel">
        اطلب الخدمة
      </button>

      {isOpen && (
        <section id="contact-inquiry-panel" className={styles.panel} aria-labelledby="inquiry-title">
          {submissionState === 'submitted' && receipt ? (
            <div className={styles.success} role="status" aria-live="polite">
              <span className={styles.successIcon} aria-hidden="true">✓</span>
              <div>
                <p className={styles.kicker}>تم تسجيل الاستفسار</p>
                <h2 id="inquiry-title">تم إرسال طلبك بنجاح</h2>
                <p>وصل استفسارك إلى {businessName}. لا يُعد الإرسال تأكيداً للحجز أو موعداً لتقديم الخدمة.</p>
                <p className={styles.receipt}>رقم المتابعة: <bdi>{receipt.id}</bdi></p>
                <div className={styles.successActions}>
                  <button type="button" className={styles.secondaryButton} onClick={resetForm}>إرسال استفسار آخر</button>
                  <button type="button" className={styles.textButton} onClick={closeForm}>إغلاق</button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <header className={styles.heading}>
                <div>
                  <p className={styles.kicker}>تواصل حقيقي ومباشر</p>
                  <h2 id="inquiry-title">اطلب الخدمة من {businessName}</h2>
                  <p>اشرح احتياجك بوضوح ليتمكن مقدم الخدمة من التواصل معك.</p>
                </div>
                <button type="button" className={styles.closeButton} onClick={closeForm} aria-label="إغلاق نموذج طلب الخدمة">×</button>
              </header>

              <form className={styles.form} onSubmit={handleSubmit} aria-busy={submissionState === 'submitting'}>
                <label htmlFor="inquiry-name">الاسم</label>
                <input ref={nameInputRef} id="inquiry-name" name="name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} autoComplete="name" required />

                <label htmlFor="inquiry-email">البريد الإلكتروني</label>
                <input id="inquiry-email" name="contactEmail" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} type="email" minLength={3} maxLength={254} autoComplete="email" dir="ltr" required />

                <label htmlFor="inquiry-message">ما الخدمة التي تحتاجها؟</label>
                <textarea id="inquiry-message" name="message" value={message} onChange={(event) => setMessage(event.target.value)} minLength={10} maxLength={2000} rows={5} aria-describedby="inquiry-message-help inquiry-privacy" required />
                <p id="inquiry-message-help" className={styles.help}>اكتب 10 أحرف على الأقل، وتجنب إدخال كلمات المرور أو البيانات الحساسة.</p>

                <p id="inquiry-privacy" className={styles.privacy}>تُستخدم بياناتك لهذا الاستفسار فقط، ولن تظهر علناً في ملف العمل.</p>
                {error && <p className={styles.error} role="alert">{error}</p>}
                <button type="submit" className={styles.primaryButton} disabled={submissionState === 'submitting'}>
                  {submissionState === 'submitting' ? 'جارٍ إرسال الطلب…' : 'إرسال طلب الخدمة'}
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </div>
  );
}
