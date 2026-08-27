'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { identityApi } from '../../../lib/identity-api';
import { IdentityVisual } from '../identity-visual';

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim().toLowerCase();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await identityApi.forgotPassword(email);
      setMessage('إذا كان البريد مسجلاً، ستصلك رسالة تحتوي على رابط آمن لإعادة تعيين كلمة المرور.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر معالجة الطلب الآن.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="foundation-content" className="auth-experience" aria-label="استعادة كلمة المرور">
      <div className="auth-phone auth-phone-login">
        <IdentityVisual />
        <form className="auth-panel" onSubmit={submit}>
          <header className="auth-panel-title"><span className="auth-status-icon auth-status-waiting" aria-hidden="true">✉</span><h1>استعادة كلمة المرور</h1><p>سنرسل إليك رابطًا آمنًا لإنشاء كلمة مرور جديدة.</p></header>
          <p>أدخل بريدك الإلكتروني وسنرسل رابط إعادة تعيين إذا كان الحساب موجوداً.</p>
          <label className="auth-field"><span>البريد الإلكتروني</span><input name="email" type="email" autoComplete="email" required /></label>
          {message ? <p className="auth-success" role="status">{message}</p> : null}
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="auth-primary" type="submit" disabled={loading}>{loading ? 'جاري الإرسال...' : 'إرسال رابط الاستعادة'}</button>
          <Link className="auth-secondary" href="/auth/login">العودة إلى تسجيل الدخول</Link>
        </form>
      </div>
    </main>
  );
}
