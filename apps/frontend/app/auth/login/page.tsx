'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api } from '../../../lib/api-client';
import { productionAuth } from '../../../lib/auth-production';
import { signInWithGoogle } from '../../../lib/firebase/google-sign-in';
import { PlatformIcon } from '../../components/platform-icon';
import { IdentityVisual } from '../identity-visual';

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    const form = event.currentTarget;
    try {
      await api.auth.login((form.elements.namedItem('email') as HTMLInputElement).value, (form.elements.namedItem('password') as HTMLInputElement).value);
      router.push('/organizations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول. تحقق من بياناتك.');
    } finally { setIsLoading(false); }
  }

  async function googleLogin() {
    setError('');
    setGoogleLoading(true);
    try {
      const idToken = await signInWithGoogle();
      await productionAuth.google(idToken);
      router.push('/organizations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول عبر Google.');
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <main id="foundation-content" className="auth-experience" aria-label="تسجيل الدخول">
      <div className="auth-phone auth-phone-login">
        <IdentityVisual />
        <form className="auth-panel" onSubmit={submitLogin} noValidate>
          <header className="auth-panel-title"><PlatformIcon name="user" /><h1>تسجيل الدخول</h1></header>
          <label className="auth-field"><PlatformIcon name="mail" /><span>البريد الإلكتروني</span><input aria-label="البريد الإلكتروني" name="email" type="email" autoComplete="email" required /></label>
          <label className="auth-field"><PlatformIcon name="lock" /><span>كلمة المرور</span><input aria-label="كلمة المرور" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required minLength={8} /><button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} aria-pressed={showPassword}><PlatformIcon name="eye" /></button></label>
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBlockStart: '-0.25rem' }}><Link href="/auth/forgot-password">نسيت كلمة المرور؟</Link></div>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="auth-primary" type="submit" aria-busy={isLoading} disabled={isLoading || googleLoading}>{isLoading ? 'جاري الدخول...' : 'تسجيل الدخول'}<PlatformIcon name="arrow" /></button>
          <div className="auth-divider"><span>أو</span></div>
          <button className="auth-secondary" type="button" onClick={googleLogin} aria-busy={googleLoading} disabled={googleLoading || isLoading}>{googleLoading ? 'جاري الاتصال بـ Google...' : 'المتابعة باستخدام Google'}</button>
          <Link className="auth-secondary" href="/auth/register">إنشاء حساب جديد <PlatformIcon name="userPlus" /></Link>
        </form>
        <p className="auth-help"><PlatformIcon name="user" size={17} /> أو <Link href="/">الاستمرار كزائر</Link></p>
      </div>
    </main>
  );
}
