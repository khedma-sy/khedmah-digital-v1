'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api-client';
import { getFacebookIdToken, getGoogleIdToken } from '../../../lib/firebase/auth';
import { identityApi } from '../../../lib/identity-api';
import { PlatformIcon } from '../../components/platform-icon';
import { IdentityVisual } from '../identity-visual';
import { SocialProviderIcon } from '../social-provider-icon';

export default function LoginPage() {
  const router = useRouter();
  const [destination, setDestination] = useState('/organizations');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isFacebookLoading, setIsFacebookLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    const requestedDestination = new URLSearchParams(window.location.search).get('next');
    if (requestedDestination?.startsWith('/') && !requestedDestination.startsWith('//')) setDestination(requestedDestination);
  }, []);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setVerificationEmail('');
    setIsLoading(true);
    const form = event.currentTarget;
    try {
      await api.auth.login(
        (form.elements.namedItem('email') as HTMLInputElement).value,
        (form.elements.namedItem('password') as HTMLInputElement).value
      );
      router.push(destination);
    } catch (err) {
      if ((err as { code?: string }).code === 'EMAIL_VERIFICATION_REQUIRED') {
        const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim().toLowerCase();
        setVerificationEmail(email);
        setError('حسابك بانتظار تأكيد البريد الإلكتروني. افتح رسالة خدمة أو اطلب رسالة جديدة.');
      } else {
        setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول. تحقق من بياناتك.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function resendVerification() {
    if (!verificationEmail || isResending) return;
    setIsResending(true);
    try {
      await identityApi.requestEmailVerification(verificationEmail);
      setError('أرسلنا رسالة تحقق جديدة. افحص صندوق الوارد والبريد غير المرغوب فيه.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرسال رسالة التحقق الآن.');
    } finally {
      setIsResending(false);
    }
  }

  async function signInWithGoogle() {
    setError('');
    setIsGoogleLoading(true);
    try {
      const idToken = await getGoogleIdToken();
      await identityApi.google(idToken);
      router.push(destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول عبر Google.');
    } finally {
      setIsGoogleLoading(false);
    }
  }

  async function signInWithFacebook() {
    setError('');
    setIsFacebookLoading(true);
    try {
      const idToken = await getFacebookIdToken();
      await identityApi.facebook(idToken);
      router.push(destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول عبر Facebook.');
    } finally {
      setIsFacebookLoading(false);
    }
  }

  return (
    <main id="foundation-content" className="auth-experience" aria-label="تسجيل الدخول">
      <div className="auth-phone auth-phone-login">
        <IdentityVisual />
        <form className="auth-panel" onSubmit={submitLogin} noValidate>
          <nav className="auth-tabs" aria-label="الدخول وإنشاء الحساب">
            <Link href="/auth/register">سجل الآن</Link>
            <span aria-current="page">تسجيل الدخول</span>
          </nav>
          <label className="auth-field"><PlatformIcon name="mail" /><span>البريد الإلكتروني</span><input aria-label="البريد الإلكتروني" name="email" type="email" autoComplete="email" required /></label>
          <label className="auth-field"><PlatformIcon name="lock" /><span>كلمة المرور</span><input aria-label="كلمة المرور" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required minLength={8} /><button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} aria-pressed={showPassword}><PlatformIcon name="eye" /></button></label>
          <div className="auth-options"><label><input name="remember" type="checkbox" /> تذكرني</label><Link href="/auth/forgot-password">نسيت كلمة المرور؟</Link></div>
          {error ? <p className={verificationEmail ? 'auth-notice' : 'auth-error'} role="alert">{error}</p> : null}
          {verificationEmail ? <button className="auth-resend" type="button" onClick={resendVerification} disabled={isResending}>{isResending ? 'جاري الإرسال...' : 'إعادة إرسال رابط التحقق'}</button> : null}
          <button className="auth-primary" type="submit" aria-busy={isLoading} disabled={isLoading || isGoogleLoading || isFacebookLoading}>{isLoading ? 'جاري الدخول...' : 'تسجيل الدخول'}<PlatformIcon name="arrow" /></button>
          <div className="auth-divider"><span>أو</span></div>
          <div className="auth-social-grid">
            <button className="auth-secondary auth-google" type="button" onClick={signInWithGoogle} aria-busy={isGoogleLoading} disabled={isLoading || isGoogleLoading || isFacebookLoading}><SocialProviderIcon provider="google" />{isGoogleLoading ? 'جاري الاتصال...' : 'تسجيل الدخول عبر Google'}</button>
            <button className="auth-secondary auth-facebook" type="button" onClick={signInWithFacebook} aria-busy={isFacebookLoading} disabled={isLoading || isGoogleLoading || isFacebookLoading}><SocialProviderIcon provider="facebook" />{isFacebookLoading ? 'جاري الاتصال...' : 'تسجيل الدخول عبر Facebook'}</button>
          </div>
        </form>
        <p className="auth-help"><PlatformIcon name="user" size={17} /> أو <Link href="/">الاستمرار كزائر</Link></p>
      </div>
    </main>
  );
}
