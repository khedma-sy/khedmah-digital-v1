'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { identityApi } from '../../../lib/identity-api';
import { IdentityVisual } from '../identity-visual';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = event.currentTarget;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    const confirm = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;
    if (password !== confirm) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    if (!token) {
      setError('رابط إعادة التعيين غير صالح أو ناقص.');
      return;
    }
    setLoading(true);
    try {
      await identityApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إعادة تعيين كلمة المرور.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="foundation-content" className="auth-experience" aria-label="إعادة تعيين كلمة المرور">
      <div className="auth-phone auth-phone-register">
        <IdentityVisual />
        {done ? (
          <section className="auth-panel">
            <header className="auth-panel-title"><span className="auth-status-icon" aria-hidden="true">✓</span><h1>تم تحديث كلمة المرور</h1><p>يمكنك العودة إلى حسابك بأمان.</p></header>
            <p>تم تغيير كلمة المرور وإلغاء الجلسات السابقة لحماية حسابك.</p>
            <Link className="auth-primary" href="/auth/login">تسجيل الدخول</Link>
          </section>
        ) : (
          <form className="auth-panel" onSubmit={submit}>
            <header className="auth-panel-title"><span className="auth-status-icon auth-status-waiting" aria-hidden="true">⌁</span><h1>كلمة مرور جديدة</h1><p>اختر كلمة مرور قوية لا تستخدمها في حساب آخر.</p></header>
            <label className="auth-field"><span>كلمة المرور الجديدة</span><input name="password" type="password" autoComplete="new-password" required minLength={8} /></label>
            <label className="auth-field"><span>تأكيد كلمة المرور</span><input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} /></label>
            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            <button className="auth-primary" type="submit" disabled={loading}>{loading ? 'جاري الحفظ...' : 'حفظ كلمة المرور الجديدة'}</button>
            <Link className="auth-secondary" href="/auth/login">العودة إلى تسجيل الدخول</Link>
          </form>
        )}
      </div>
    </main>
  );
}
