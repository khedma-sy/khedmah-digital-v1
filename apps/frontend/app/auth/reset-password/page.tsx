'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { productionAuth } from '../../../lib/auth-production';
import { IdentityVisual } from '../identity-visual';

export default function ResetPasswordPage() {
  const search = useSearchParams();
  const token = search.get('token') ?? '';
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!token) {
      setError('رابط إعادة التعيين غير صالح.');
      return;
    }
    const form = event.currentTarget;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    const confirmPassword = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;
    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    setLoading(true);
    try {
      await productionAuth.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إعادة تعيين كلمة المرور.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="foundation-content" className="auth-experience" aria-label="تعيين كلمة مرور جديدة">
      <div className="auth-phone auth-phone-register">
        <IdentityVisual />
        {done ? (
          <section className="auth-panel"><h1>تم تحديث كلمة المرور</h1><p>تم إلغاء الجلسات السابقة لحماية حسابك. يمكنك تسجيل الدخول الآن.</p><Link className="auth-primary" href="/auth/login">تسجيل الدخول</Link></section>
        ) : (
          <form className="auth-panel" onSubmit={submit} noValidate>
            <header className="auth-panel-title"><h1>كلمة مرور جديدة</h1></header>
            <label className="auth-field"><span>كلمة المرور الجديدة</span><input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} /></label>
            <label className="auth-field"><span>تأكيد كلمة المرور</span><input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} /></label>
            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            <button className="auth-primary" type="submit" disabled={loading} aria-busy={loading}>{loading ? 'جاري الحفظ...' : 'حفظ كلمة المرور الجديدة'}</button>
          </form>
        )}
      </div>
    </main>
  );
}
