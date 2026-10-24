import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchGoogleRestaurantRoute } from './restaurant-route.provider';

test('Google restaurant route requests server-authoritative distance and duration only', async () => {
  let request: { url?: string; init?: RequestInit } = {};
  const route = await fetchGoogleRestaurantRoute(
    { latitude: 33.5, longitude: 36.2 },
    { latitude: 33.6, longitude: 36.3 },
    {
      apiKey: 'server-key',
      now: 1_000_000,
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        request = { url: String(url), init };
        return new Response(JSON.stringify({ routes: [{ distanceMeters: 5500, duration: '901s' }] }), { status: 200 });
      }) as typeof fetch,
    },
  );
  assert.equal(request.url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
  assert.equal((request.init?.headers as Record<string,string>)['x-goog-api-key'], 'server-key');
  assert.equal((request.init?.headers as Record<string,string>)['x-goog-fieldmask'], 'routes.distanceMeters,routes.duration');
  assert.deepEqual(route, {
    distanceMeters: 5500,
    durationSeconds: 901,
    verified: true,
    source: 'google-routes-v2',
    referenceId: route.referenceId,
    expiresAt: 1_300_000,
  });
  assert.match(route.referenceId, /^[a-f0-9]{24}$/);
});

test('Google restaurant route fails closed without key or valid provider response', async () => {
  await assert.rejects(fetchGoogleRestaurantRoute(
    { latitude: 33.5, longitude: 36.2 }, { latitude: 33.6, longitude: 36.3 },
  ), /not configured/);
  await assert.rejects(fetchGoogleRestaurantRoute(
    { latitude: 33.5, longitude: 36.2 }, { latitude: 33.6, longitude: 36.3 },
    { apiKey: 'x', fetchImpl: (async () => new Response('{}', { status: 503 })) as typeof fetch },
  ), /request failed/);
  await assert.rejects(fetchGoogleRestaurantRoute(
    { latitude: 33.5, longitude: 36.2 }, { latitude: 33.6, longitude: 36.3 },
    { apiKey: 'x', fetchImpl: (async () => new Response(JSON.stringify({ routes: [{ distanceMeters: 0, duration: '0s' }] }), { status: 200 })) as typeof fetch },
  ), /distance is invalid/);
});

test('Google restaurant route rejects coercible distance values before trusting provider billing distance', async () => {
  const origin = { latitude: 33.5, longitude: 36.2 };
  const destination = { latitude: 33.6, longitude: 36.3 };
  for (const invalid of ['5500', true, false, [5500], null, undefined]) {
    await assert.rejects(
      fetchGoogleRestaurantRoute(origin, destination, {
        apiKey: 'server-key',
        fetchImpl: (async () => new Response(
          JSON.stringify({ routes: [{ distanceMeters: invalid, duration: '901s' }] }),
          { status: 200 },
        )) as typeof fetch,
      }),
      /Google Routes distance is invalid/,
      `Provider distance ${JSON.stringify(invalid)} must fail closed`,
    );
  }
});
