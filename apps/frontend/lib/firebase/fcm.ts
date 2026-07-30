import { getMessaging, isSupported, type Messaging } from 'firebase/messaging';
import { getFirebaseClientServices } from './client';

/** Prepares the FCM client only. It never requests permission or registers a token. */
export async function prepareFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === 'undefined' || !(await isSupported())) return null;
  return getMessaging(getFirebaseClientServices().app);
}
