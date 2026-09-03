'use client';

import { FacebookAuthProvider, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirebaseClientServices } from './client';

type SocialProviderName = 'Google' | 'Facebook';

export const FACEBOOK_AUTH_ENABLED = process.env.NEXT_PUBLIC_FACEBOOK_AUTH_ENABLED === 'true';

export async function clearFirebaseSocialSession(): Promise<void> {
  try {
    const { auth } = getFirebaseClientServices();
    if (auth.currentUser) await signOut(auth);
  } catch {
    // The backend cookie is the canonical platform session. Firebase cleanup is
    // best-effort so it can never trap a user after the backend logged them out.
  }
}

export async function clearFirebaseSocialSession(): Promise<void> {
  try {
    const { auth } = getFirebaseClientServices();
    if (auth.currentUser) await signOut(auth);
  } catch {
    // The backend cookie is the canonical platform session. Firebase cleanup is
    // best-effort so it can never trap a user after the backend logged them out.
  }
}

export function translateFirebaseSocialAuthError(provider: SocialProviderName, cause: unknown): Error {
  const code = typeof cause === 'object' && cause !== null && 'code' in cause
    ? String((cause as { code?: unknown }).code ?? '')
    : '';

  const messages: Record<string, string> = {
    'auth/operation-not-allowed': `تسجيل الدخول عبر ${provider} غير مفعّل في إعدادات Firebase لهذا المشروع.`,
    'auth/unauthorized-domain': 'نطاق الموقع الحالي غير مضاف إلى النطاقات المصرّح بها في Firebase.',
    'auth/app-not-authorized': 'تطبيق خدمة غير مصرح له باستخدام إعدادات Firebase الحالية.',
    'auth/configuration-not-found': `إعداد تسجيل الدخول عبر ${provider} غير مكتمل في Firebase.`,
    'auth/invalid-api-key': 'تعذر اعتماد إعداد Firebase للموقع الحالي.',
    'auth/network-request-failed': `تعذر الاتصال بخدمة ${provider}. تحقق من الشبكة ثم أعد المحاولة.`,
    'auth/internal-error': `تعذر إكمال الاتصال مع ${provider} الآن. استخدم البريد وكلمة المرور أو أعد المحاولة لاحقًا.`,
    'auth/web-storage-unsupported': 'المتصفح يمنع التخزين اللازم لتسجيل الدخول. فعّل ملفات الارتباط ثم أعد المحاولة.',
    'auth/popup-blocked': 'منع المتصفح نافذة تسجيل الدخول. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.',
    'auth/popup-closed-by-user': 'أُغلقت نافذة تسجيل الدخول قبل اكتمال العملية.',
    'auth/cancelled-popup-request': 'أُلغيت محاولة تسجيل الدخول السابقة. أعد المحاولة مرة واحدة.',
    'auth/account-exists-with-different-credential': 'يوجد حساب بهذا البريد بطريقة دخول مختلفة. استخدم الطريقة المرتبطة بالحساب أولًا.'
  };

  return new Error(messages[code] ?? `تعذر إكمال تسجيل الدخول عبر ${provider} الآن. استخدم البريد وكلمة المرور أو أعد المحاولة لاحقًا.`);
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
