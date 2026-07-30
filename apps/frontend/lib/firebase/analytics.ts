import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';
import { getFirebaseClientServices } from './client';

/** Analytics is browser-only and remains inert when the runtime is unsupported. */
export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === 'undefined' || !(await isSupported())) return null;
  return getAnalytics(getFirebaseClientServices().app);
}
