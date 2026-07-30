import type { FirebaseOptions } from 'firebase/app';

function required(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Missing required public Firebase configuration: ${name}`);
  return normalized;
}

/** Single browser-safe Firebase configuration contract. Values are injected at build time. */
export function getFirebaseWebConfig(): FirebaseOptions {
  return Object.freeze({
    apiKey: required('NEXT_PUBLIC_FIREBASE_API_KEY', process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: required('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: required('NEXT_PUBLIC_FIREBASE_PROJECT_ID', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: required('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: required('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    appId: required('NEXT_PUBLIC_FIREBASE_APP_ID', process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
    measurementId: required('NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID', process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID)
  });
}
