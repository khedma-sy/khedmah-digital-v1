'use client';

import { FormEvent, useState } from 'react';
import { api } from '../../../lib/api-client';

interface ContactInquiryFormProps {
  readonly businessProfileId: string;
  readonly businessName: string;
}

export function ContactInquiryForm({ businessProfileId, businessName }: ContactInquiryFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await api.businesses.submitInquiry(businessProfileId, { name, contactEmail, message });
      setSubmitted(true);
    } catch (err) {
      const statusCode = err instanceof Error ? (err as Error & { statusCode?: number }).statusCode : undefined;
      if (statusCode === 401) {
        setError('سجّل الدخول أولاً لإرسال طلب الخدمة.');
      } else if (statusCode === 429) {
        setError('تم إرسال عدة طلبات خلال وقت قصير. يرجى المحاولة لاحقاً.');
      } else {
        setError('تعذر إرسال الطلب الآن. راجع البيانات وحاول مرة أخرى.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) {
    return (
      <button type="button" className="service-request-button" onClick={() => setIsOpen(true)}>
        اطلب الخدمة
      </button>
    );
  }

  if (submitted) {
    return (
      <section className="inquiry-success" aria-live="polite" aria-labelledby="inquiry-success-title">
        <span className="inquiry-success-icon" aria-hidden="true">✓</span>
        <div>
          <h2 id="inquiry-success-title">تم إرسال طلبك بنجاح</h2>
          <p>وصل استفسارك إلى {businessName}. لا يُعد الإرسال تأكيداً للحجز أو موعداً لتقديم الخدمة.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="inquiry-panel" aria-labelledby="inquiry-title">
      <div className="inquiry-heading">
        <div>
          <p className="eyebrow">تواصل حقيقي ومباشر</p>
          <h2 id="inquiry-title">اطلب الخدمة من {businessName}</h2>
          <p>أرسل تفاصيل احتياجك وبيانات التواصل ليتمكن مقدم الخدمة من الرد عليك.</p>
        </div>
        <button type="button" className="inquiry-close" onClick={() => setIsOpen(false)} aria-label="إغلاق نموذج طلب الخدمة">×</button>
      </div>

      <form className="inquiry-form" onSubmit={handleSubmit}>
        <label>
          الاسم
          <input name="name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} autoComplete="name" required />
        </label>
        <label>
          البريد الإلكتروني
          <input name="contactEmail" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} type="email" maxLength={254} autoComplete="email" required />
        </label>
        <label>
          ما الخدمة التي تحتاجها؟
          <textarea name="message" value={message} onChange={(event) => setMessage(event.target.value)} minLength={10} maxLength={2000} rows={5} required />
        </label>
        <p className="inquiry-privacy">تُستخدم بياناتك لهذا الاستفسار فقط، ولن تظهر علناً في ملف العمل.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="service-request-button" disabled={isSubmitting}>
          {isSubmitting ? 'جارٍ إرسال الطلب…' : 'إرسال طلب الخدمة'}
        </button>
      </form>
    </section>
  );
}
