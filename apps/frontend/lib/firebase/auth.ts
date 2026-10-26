'use client';

import { FacebookAuthProvider, GoogleAuthProvider, getRedirectResult, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { getFirebaseClientServices } from './client';

type SocialProviderName = 'Google' | 'Facebook';

export const FACEBOOK_AUTH_ENABLED = process.env.NEXT_PUBLIC_FACEBOOK_AUTH_ENABLED === 'true';

export function translateFirebaseSocialAuthError(provider: SocialProviderName, cause: unknown): Error {
  const code = typeof cause === 'object' && cause !== null && 'code' in cause
    ? String((cause as { code?: unknown }).code ?? '')
    : '';

  const messages: Record<string, string> = {
    'auth/operation-not-allowed': `تسجيل الدخول عبر ${provider} غير مفعّل في إعدادات Firebase لهذا المشروع.`,
    'auth/unauthorized-domain': 'نطاق الموقع الحالي غير مضاف إلى النطاقات المصرّح بها في Firebase.',
    'auth/popup-blocked': 'منع المتصفح نافذة تسجيل الدخول. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.',
    'auth/popup-closed-by-user': 'أُغلقت نافذة تسجيل الدخول قبل اكتمال العملية.',
    'auth/cancelled-popup-request': 'أُلغيت محاولة تسجيل الدخول السابقة. أعد المحاولة مرة واحدة.',
    'auth/account-exists-with-different-credential': 'يوجد حساب بهذا البريد بطريقة دخول مختلفة. استخدم الطريقة المرتبطة بالحساب أولًا.',
    'auth/unauthorized-continue-uri': 'عنوان العودة بعد تسجيل الدخول غير مسموح به في إعدادات Firebase.',
    'auth/network-request-failed': 'تعذر الاتصال بخدمة تسجيل الدخول. تحقق من الاتصال بالإنترنت ثم أعد المحاولة.'
  };

  return new Error(messages[code] ?? `تعذر تسجيل الدخول عبر ${provider}. تحقق من إعدادات المزوّد ثم أعد المحاولة.`);
}

function shouldUseRedirectForGoogle(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent)
    || window.matchMedia('(pointer: coarse)').matches;
}

/** Starts Google sign-in. Mobile browsers use redirect because popup flows can lose the result. */
export async function beginGoogleSignIn(): Promise<string | null> {
  try {
    const { auth } = getFirebaseClientServices();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    if (shouldUseRedirectForGoogle()) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    const credential = await signInWithPopup(auth, provider);
    return await credential.user.getIdToken(true);
  } catch (error) {
    throw translateFirebaseSocialAuthError('Google', error);
  }
}

/** Reads a pending Google redirect result after Firebase returns to the site. */
export async function getGoogleRedirectIdToken(): Promise<string | null> {
  try {
    const { auth } = getFirebaseClientServices();
    const result = await getRedirectResult(auth);
    return result?.user ? await result.user.getIdToken(true) : null;
  } catch (error) {
    throw translateFirebaseSocialAuthError('Google', error);
  }
}

export async function getGoogleIdToken(): Promise<string> {
  const token = await beginGoogleSignIn();
  if (!token) throw new Error('تم بدء تسجيل الدخول. انتظر العودة من Google لإكمال العملية.');
  return token;
}

export async function getFacebookIdToken(): Promise<string> {
  try {
    const { auth } = getFirebaseClientServices();
    const provider = new FacebookAuthProvider();
    provider.addScope('email');
    const credential = await signInWithPopup(auth, provider);
    return await credential.user.getIdToken(true);
  } catch (error) {
    throw translateFirebaseSocialAuthError('Facebook', error);
  }
}
