export interface RestaurantPushReadiness {
  supported: boolean;
  configured: boolean;
  reason?: 'unsupported_browser' | 'missing_vapid_key';
}

/**
 * Pure readiness gate for Web Push/FCM.
 * This does not request notification permission, obtain a token, or send anything.
 */
export function restaurantPushReadiness(input: {
  browserSupported: boolean;
  vapidKey?: string | null;
}): RestaurantPushReadiness {
  if (!input.browserSupported) return { supported: false, configured: false, reason: 'unsupported_browser' };
  const key = input.vapidKey?.trim();
  if (!key) return { supported: true, configured: false, reason: 'missing_vapid_key' };
  return { supported: true, configured: true };
}
