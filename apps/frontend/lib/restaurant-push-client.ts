import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { getFirebaseClientServices } from './firebase/client';

export interface RestaurantPushClientToken {
  token: string;
  deviceId: string;
}

function deviceId(storage: Storage): string {
  const key = 'khedmah:push-device-id:v1';
  const existing = storage.getItem(key)?.trim();
  if (existing && /^[A-Za-z0-9:_\-.]{8,200}$/.test(existing)) return existing;
  const created = `web-${crypto.randomUUID()}`;
  storage.setItem(key, created);
  return created;
}

export async function acquireRestaurantPushToken(options: {
  vapidKey?: string | null;
  serviceWorkerRegistration: ServiceWorkerRegistration;
  storage?: Storage;
}): Promise<RestaurantPushClientToken> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') throw new Error('Push is not supported in this environment.');
  if (!await isSupported()) throw new Error('Firebase Messaging is not supported in this browser.');
  const vapidKey = options.vapidKey?.trim();
  if (!vapidKey) throw new Error('Firebase VAPID key is not configured.');
  if (Notification.permission !== 'granted') throw new Error('Notification permission has not been granted.');
  const messaging = getMessaging(getFirebaseClientServices().app);
  const token = (await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: options.serviceWorkerRegistration,
  })).trim();
  if (token.length < 20) throw new Error('Firebase Messaging did not return a valid token.');
  return {
    token,
    deviceId: deviceId(options.storage ?? window.localStorage),
  };
}
