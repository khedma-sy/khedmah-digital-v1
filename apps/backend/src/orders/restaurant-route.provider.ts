import { createHash } from 'node:crypto';
import type { TrustedRestaurantRoute } from './restaurant-delivery-quote';

export interface RestaurantRoutePoint { latitude: number; longitude: number }

function coordinate(value: number, min: number, max: number, field: string) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${field} is invalid.`);
  return value;
}

function durationSeconds(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?s$/.test(value)) throw new Error('Google Routes duration is invalid.');
  const seconds = Math.ceil(Number(value.slice(0, -1)));
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86_400) throw new Error('Google Routes duration is invalid.');
  return seconds;
}

export async function fetchGoogleRestaurantRoute(
  origin: RestaurantRoutePoint,
  destination: RestaurantRoutePoint,
  options: { apiKey?: string | null; fetchImpl?: typeof fetch; now?: number } = {},
): Promise<TrustedRestaurantRoute> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) throw new Error('Google Routes server key is not configured.');
  const from = {
    latitude: coordinate(origin.latitude, -90, 90, 'origin.latitude'),
    longitude: coordinate(origin.longitude, -180, 180, 'origin.longitude'),
  };
  const to = {
    latitude: coordinate(destination.latitude, -90, 90, 'destination.latitude'),
    longitude: coordinate(destination.longitude, -180, 180, 'destination.longitude'),
  };
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
      'x-goog-fieldmask': 'routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify({
      origin: { location: { latLng: from } },
      destination: { location: { latLng: to } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
    }),
  });
  if (!response.ok) throw new Error(`Google Routes request failed (${response.status}).`);
  const payload = await response.json() as { routes?: Array<{ distanceMeters?: unknown; duration?: unknown }> };
  const route = payload.routes?.[0];
  // Google Routes specifies an integer JSON number. Never coerce strings or booleans into a trusted billable distance.
  const distanceMeters = route?.distanceMeters;
  if (typeof distanceMeters !== 'number' || !Number.isSafeInteger(distanceMeters) || distanceMeters < 1 || distanceMeters > 500_000) {
    throw new Error('Google Routes distance is invalid.');
  }
  const seconds = durationSeconds(route?.duration);
  const now = options.now ?? Date.now();
  const referenceId = createHash('sha256')
    .update(JSON.stringify({ from, to, distanceMeters, seconds }))
    .digest('hex')
    .slice(0, 24);
  return {
    distanceMeters,
    durationSeconds: seconds,
    verified: true,
    source: 'google-routes-v2',
    referenceId,
    expiresAt: now + 5 * 60_000,
  };
}
