'use client';

import { FacebookAuthProvider, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
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
    'auth/account-exists-with-different-credential': 'يوجد حساب بهذا البريد بطريقة دخول مختلفة. استخدم الطريقة المرتبطة بالحساب أولًا.'
  };

  return new Error(messages[code] ?? `تعذر تسجيل الدخول عبر ${provider}. تحقق من إعدادات المزوّد ثم أعد المحاولة.`);
}

export async function getGoogleIdToken(): Promise<string> {
  try {
    const { auth } = getFirebaseClientServices();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await signInWithPopup(auth, provider);
    return credential.user.getIdToken(true);
  } catch (error) {
    throw translateFirebaseSocialAuthError('Google', error);
  }
}

export async function getFacebookIdToken(): Promise<string> {
  try {
    const { auth } = getFirebaseClientServices();
    const provider = new FacebookAuthProvider();
    provider.addScope('email');
    const credential = await signInWithPopup(auth, provider);
    return credential.user.getIdToken(true);
  } catch (error) {
    throw translateFirebaseSocialAuthError('Facebook', error);
  }
}
