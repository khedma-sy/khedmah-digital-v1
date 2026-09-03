'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { identityApi } from '../../../lib/identity-api';
import { FACEBOOK_AUTH_ENABLED, getFacebookIdToken, getGoogleIdToken } from '../../../lib/firebase/auth';
import { PlatformIcon } from '../../components/platform-icon';
import { IdentityGatewayAside, IdentityGatewayOrnaments } from '../identity-visual';
import { SocialProviderIcon } from '../social-provider-icon';

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isFacebookLoading, setIsFacebookLoading] = useState(false);
  const [visiblePassword, setVisiblePassword] = useState<'password' | 'confirmPassword' | null>(null);
  const [passwordValue, setPasswordValue] = useState('');
  const [confirmPasswordValue, setConfirmPasswordValue] = useState('');

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
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
      router.push('/users/me');
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
      router.push('/users/me');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر المتابعة عبر Facebook.');
    } finally {
      setIsFacebookLoading(false);
    }
  }

  const hasMinimumPasswordLength = passwordValue.length >= 8;
  const passwordsMatch = confirmPasswordValue.length > 0 && passwordValue === confirmPasswordValue;

  return (
    <main id="foundation-content" className="auth-experience auth-gateway-experience auth-register-experience" aria-label="إنشاء حساب جديد">
      <IdentityGatewayOrnaments />
      <div className="auth-phone auth-phone-gateway auth-phone-register">
        <Link className="auth-back" href="/" aria-label="العودة"><PlatformIcon name="arrow" /></Link>
        <IdentityGatewayAside mode="register" />
        <form className="auth-panel register-panel" onSubmit={submitRegistration} noValidate>
          <header className="register-form-heading">
            <span>إنشاء حساب جديد</span>
            <h2>أدخل بيانات حسابك</h2>
          </header>
          <nav className="auth-tabs" aria-label="الدخول وإنشاء الحساب">
            <span aria-current="page">سجل الآن</span>
            <Link href="/auth/login">تسجيل الدخول</Link>
          </nav>
          <div className="register-fields">
            <label className="auth-field"><PlatformIcon name="user" /><span>الاسم الكامل</span><input aria-label="الاسم الكامل" name="displayName" autoComplete="name" required minLength={2} maxLength={80} placeholder="اكتب اسمك الكامل" /></label>
            <label className="auth-field"><PlatformIcon name="mail" /><span>البريد الإلكتروني</span><input aria-label="البريد الإلكتروني" name="email" type="email" autoComplete="email" required placeholder="name@example.com" dir="ltr" /></label>
            <label className="auth-field"><PlatformIcon name="lock" /><span>كلمة المرور</span><input aria-label="كلمة المرور" name="password" value={passwordValue} onChange={(event) => setPasswordValue(event.target.value)} type={visiblePassword === 'password' ? 'text' : 'password'} autoComplete="new-password" required minLength={8} placeholder="8 أحرف على الأقل" /><button type="button" className="password-toggle" onClick={() => setVisiblePassword((field) => field === 'password' ? null : 'password')} aria-label={visiblePassword === 'password' ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} aria-pressed={visiblePassword === 'password'}><PlatformIcon name="eye" /></button></label>
            <label className="auth-field"><PlatformIcon name="lock" /><span>تأكيد كلمة المرور</span><input aria-label="تأكيد كلمة المرور" name="confirmPassword" value={confirmPasswordValue} onChange={(event) => setConfirmPasswordValue(event.target.value)} type={visiblePassword === 'confirmPassword' ? 'text' : 'password'} autoComplete="new-password" required minLength={8} placeholder="أعد كتابة كلمة المرور" /><button type="button" className="password-toggle" onClick={() => setVisiblePassword((field) => field === 'confirmPassword' ? null : 'confirmPassword')} aria-label={visiblePassword === 'confirmPassword' ? 'إخفاء تأكيد كلمة المرور' : 'إظهار تأكيد كلمة المرور'} aria-pressed={visiblePassword === 'confirmPassword'}><PlatformIcon name="eye" /></button></label>
          </div>
          <div className="password-strength register-password-status" aria-live="polite">
            <span className={hasMinimumPasswordLength ? 'complete' : ''}><PlatformIcon name={hasMinimumPasswordLength ? 'check' : 'close'} size={16} /> 8 أحرف على الأقل</span>
            <span className={passwordsMatch ? 'complete' : ''}><PlatformIcon name={passwordsMatch ? 'check' : 'close'} size={16} /> كلمتا المرور متطابقتان</span>
          </div>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="auth-primary" type="submit" aria-busy={isLoading} disabled={isLoading || isGoogleLoading || isFacebookLoading}>{isLoading ? 'جاري إنشاء الحساب...' : 'إنشاء حساب'}<PlatformIcon name="arrow" /></button>
          <div className="auth-divider"><span>أو</span></div>
          <section className="register-social" aria-label="خيارات إنشاء الحساب الخارجية">
            <button className="auth-secondary auth-google" type="button" onClick={continueWithGoogle} aria-busy={isGoogleLoading} disabled={isLoading || isGoogleLoading || isFacebookLoading}><SocialProviderIcon provider="google" />{isGoogleLoading ? 'جاري الاتصال...' : 'المتابعة باستخدام Google'}</button>
            {FACEBOOK_AUTH_ENABLED ? <button className="auth-secondary auth-facebook" type="button" onClick={continueWithFacebook} aria-busy={isFacebookLoading} disabled={isLoading || isGoogleLoading || isFacebookLoading}><SocialProviderIcon provider="facebook" />{isFacebookLoading ? 'جاري الاتصال...' : 'المتابعة باستخدام Facebook'}</button> : <div className="register-provider-unavailable" role="status"><SocialProviderIcon provider="facebook" /><span><strong>Facebook</strong><small>غير متاح حاليًا</small></span></div>}
          </section>
        </form>
      </div>
    </main>
  );
}
