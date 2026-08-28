'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { identityApi } from '../../../lib/identity-api';
import { FACEBOOK_AUTH_ENABLED, getFacebookIdToken, getGoogleIdToken } from '../../../lib/firebase/auth';
import { PlatformIcon } from '../../components/platform-icon';
import { IdentityVisual } from '../identity-visual';
import { SocialProviderIcon } from '../social-provider-icon';

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isFacebookLoading, setIsFacebookLoading] = useState(false);
  const [visiblePassword, setVisiblePassword] = useState<'password' | 'confirmPassword' | null>(null);

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = event.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim().toLowerCase();
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    if (password !== (form.elements.namedItem('confirmPassword') as HTMLInputElement).value) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    setIsLoading(true);
    try {
      await identityApi.register(
        email,
        password,
        (form.elements.namedItem('displayName') as HTMLInputElement).value
      );
      sessionStorage.removeItem('khedmah.onboarding.complete');
      router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 409) {
        router.push(`/auth/verify-email?email=${encodeURIComponent(email)}&existing=1`);
        return;
      }
      setError(err instanceof Error ? err.message : 'يرجى إدخال بيانات صحيحة لإكمال إنشاء الحساب.');
    } finally {
      setIsLoading(false);
    }
  }

  async function continueWithGoogle() {
    setError('');
    setIsGoogleLoading(true);
    try {
      await identityApi.google(await getGoogleIdToken());
      router.push('/organizations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر المتابعة عبر Google.');
    } finally {
      setIsGoogleLoading(false);
    }
  }

  async function continueWithFacebook() {
    setError('');
    setIsFacebookLoading(true);
    try {
      await identityApi.facebook(await getFacebookIdToken());
      router.push('/organizations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر المتابعة عبر Facebook.');
    } finally {
      setIsFacebookLoading(false);
    }
  }

  return (
    <main id="foundation-content" className="auth-experience" aria-label="إنشاء حساب جديد">
      <div className="auth-phone auth-phone-register">
        <Link className="auth-back" href="/" aria-label="العودة"><PlatformIcon name="arrow" /></Link>
        <IdentityVisual />
        <section className="register-heading"><p>انضم إلى <strong>خدمة</strong> واكتشف الخدمات والأعمال والمهنيين الموثوقين.</p></section>
        <form className="auth-panel register-panel" onSubmit={submitRegistration} noValidate>
          <nav className="auth-tabs" aria-label="الدخول وإنشاء الحساب">
            <span aria-current="page">سجل الآن</span>
            <Link href="/auth/login">تسجيل الدخول</Link>
          </nav>
          <label className="auth-field"><PlatformIcon name="user" /><span>الاسم الكامل</span><input aria-label="الاسم الكامل" name="displayName" autoComplete="name" required minLength={2} maxLength={80} /></label>
          <label className="auth-field"><PlatformIcon name="mail" /><span>البريد الإلكتروني</span><input aria-label="البريد الإلكتروني" name="email" type="email" autoComplete="email" required /></label>
          <label className="auth-field"><PlatformIcon name="lock" /><span>كلمة المرور</span><input aria-label="كلمة المرور" name="password" type={visiblePassword === 'password' ? 'text' : 'password'} autoComplete="new-password" required minLength={8} /><button type="button" className="password-toggle" onClick={() => setVisiblePassword((field) => field === 'password' ? null : 'password')} aria-label={visiblePassword === 'password' ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}><PlatformIcon name="eye" /></button></label>
          <label className="auth-field"><PlatformIcon name="lock" /><span>تأكيد كلمة المرور</span><input aria-label="تأكيد كلمة المرور" name="confirmPassword" type={visiblePassword === 'confirmPassword' ? 'text' : 'password'} autoComplete="new-password" required minLength={8} /><button type="button" className="password-toggle" onClick={() => setVisiblePassword((field) => field === 'confirmPassword' ? null : 'confirmPassword')} aria-label={visiblePassword === 'confirmPassword' ? 'إخفاء تأكيد كلمة المرور' : 'إظهار تأكيد كلمة المرور'}><PlatformIcon name="eye" /></button></label>
          <div className="password-strength"><strong>يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل.</strong></div>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="auth-primary" type="submit" aria-busy={isLoading} disabled={isLoading || isGoogleLoading || isFacebookLoading}>{isLoading ? 'جاري إنشاء الحساب...' : 'إنشاء حساب'}<PlatformIcon name="arrow" /></button>
          <div className="auth-divider"><span>أو</span></div>
          <div className="auth-social-grid">
            <button className="auth-secondary auth-google" type="button" onClick={continueWithGoogle} aria-busy={isGoogleLoading} disabled={isLoading || isGoogleLoading || isFacebookLoading}><SocialProviderIcon provider="google" />{isGoogleLoading ? 'جاري الاتصال...' : 'المتابعة عبر Google'}</button>
            <button className={`auth-secondary auth-facebook${FACEBOOK_AUTH_ENABLED ? '' : ' auth-facebook-deferred'}`} type="button" onClick={FACEBOOK_AUTH_ENABLED ? continueWithFacebook : undefined} aria-busy={FACEBOOK_AUTH_ENABLED && isFacebookLoading} aria-label={FACEBOOK_AUTH_ENABLED ? 'المتابعة عبر Facebook' : 'المتابعة عبر Facebook — قريبًا'} title={FACEBOOK_AUTH_ENABLED ? undefined : 'سيتم تفعيل التسجيل عبر Facebook لاحقًا'} disabled={!FACEBOOK_AUTH_ENABLED || isLoading || isGoogleLoading || isFacebookLoading}><SocialProviderIcon provider="facebook" />{FACEBOOK_AUTH_ENABLED ? (isFacebookLoading ? 'جاري الاتصال...' : 'المتابعة عبر Facebook') : 'Facebook — قريبًا'}</button>
          </div>
        </form>
      </div>
    </main>
  );
}
