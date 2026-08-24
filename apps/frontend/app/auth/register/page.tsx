'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api } from '../../../lib/api-client';
import { PlatformIcon } from '../../components/platform-icon';
import { IdentityVisual } from '../identity-visual';

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [visiblePassword, setVisiblePassword] = useState<'password' | 'confirmPassword' | null>(null);

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = event.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    if (password !== (form.elements.namedItem('confirmPassword') as HTMLInputElement).value) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    setIsLoading(true);
    try {
      await api.auth.register(email, password, (form.elements.namedItem('displayName') as HTMLInputElement).value);
      sessionStorage.removeItem('khedmah.onboarding.complete');
      router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'يرجى إدخال بيانات صحيحة لإكمال إنشاء الحساب.');
    } finally { setIsLoading(false); }
  }

  return (
    <main id="foundation-content" className="auth-experience" aria-label="إنشاء حساب جديد">
      <div className="auth-phone auth-phone-register">
        <Link className="auth-back" href="/" aria-label="العودة"><PlatformIcon name="arrow" /></Link>
        <IdentityVisual />
        <section className="register-heading"><h1>إنشاء حساب جديد</h1><p>انضم إلى <strong>خدمة</strong> واستفد من جميع الخدمات</p></section>
        <form className="auth-panel register-panel" onSubmit={submitRegistration} noValidate>
          <label className="auth-field"><PlatformIcon name="user" /><span>الاسم الكامل</span><input aria-label="الاسم الكامل" name="displayName" autoComplete="name" required minLength={2} maxLength={80} /></label>
          <label className="auth-field"><PlatformIcon name="mail" /><span>البريد الإلكتروني</span><input aria-label="البريد الإلكتروني" name="email" type="email" autoComplete="email" required /></label>
          <label className="auth-field"><PlatformIcon name="lock" /><span>كلمة المرور</span><input aria-label="كلمة المرور" name="password" type={visiblePassword === 'password' ? 'text' : 'password'} autoComplete="new-password" required minLength={8} /><button type="button" className="password-toggle" onClick={() => setVisiblePassword((field) => field === 'password' ? null : 'password')} aria-label={visiblePassword === 'password' ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}><PlatformIcon name="eye" /></button></label>
          <label className="auth-field"><PlatformIcon name="lock" /><span>تأكيد كلمة المرور</span><input aria-label="تأكيد كلمة المرور" name="confirmPassword" type={visiblePassword === 'confirmPassword' ? 'text' : 'password'} autoComplete="new-password" required minLength={8} /><button type="button" className="password-toggle" onClick={() => setVisiblePassword((field) => field === 'confirmPassword' ? null : 'confirmPassword')} aria-label={visiblePassword === 'confirmPassword' ? 'إخفاء تأكيد كلمة المرور' : 'إظهار تأكيد كلمة المرور'}><PlatformIcon name="eye" /></button></label>
          <div className="password-strength"><strong>يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل.</strong></div>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="auth-primary" type="submit" aria-busy={isLoading} disabled={isLoading}>{isLoading ? 'جاري إنشاء الحساب...' : 'إنشاء حساب'}<PlatformIcon name="arrow" /></button>
        </form>
        <p className="login-prompt">لديك حساب بالفعل؟ <Link href="/auth/login">تسجيل الدخول</Link></p>
      </div>
    </main>
  );
}
