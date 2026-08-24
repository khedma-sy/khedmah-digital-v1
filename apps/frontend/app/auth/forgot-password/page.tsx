'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { productionAuth } from '../../../lib/auth-production';
import { IdentityVisual } from '../identity-visual';

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    const form = event.currentTarget;
    try {
      await productionAuth.forgotPassword((form.elements.namedItem('email') as HTMLInputElement).value);
      setMessage('إذا كان البريد مسجلاً فستصلك رسالة تحتوي على رابط إعادة تعيين كلمة المرور.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرسال طلب إعادة التعيين.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="foundation-content" className="auth-experience" aria-label="استعادة كلمة المرور">
      <div className="auth-phone auth-phone-login">
        <IdentityVisual />
        <form className="auth-panel" onSubmit={submit} noValidate>
          <header className="auth-panel-title"><h1>استعادة كلمة المرور</h1></header>
          <p>أدخل بريدك الإلكتروني وسنرسل رابطاً آمناً صالحاً لمدة محدودة.</p>
          <label className="auth-field"><span>البريد الإلكتروني</span><input name="email" type="email" autoComplete="email" required /></label>
          {message ? <p role="status">{message}</p> : null}
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="auth-primary" type="submit" disabled={loading} aria-busy={loading}>{loading ? 'جاري الإرسال...' : 'إرسال رابط الاستعادة'}</button>
          <Link className="auth-secondary" href="/auth/login">العودة إلى تسجيل الدخول</Link>
        </form>
      </div>
    </main>
  );
}
