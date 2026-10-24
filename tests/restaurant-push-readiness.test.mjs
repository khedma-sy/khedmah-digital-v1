import assert from 'node:assert/strict';
import test from 'node:test';
import { restaurantPushReadiness } from '../apps/frontend/lib/restaurant-push-readiness.ts';

test('restaurant push readiness fails closed without browser support', () => {
  assert.deepEqual(restaurantPushReadiness({ browserSupported:false, vapidKey:'x' }), {
    supported:false, configured:false, reason:'unsupported_browser'
  });
});

test('restaurant push readiness fails closed without VAPID configuration', () => {
  assert.deepEqual(restaurantPushReadiness({ browserSupported:true }), {
    supported:true, configured:false, reason:'missing_vapid_key'
  });
});

test('restaurant push readiness reports configuration only when VAPID exists', () => {
  assert.deepEqual(restaurantPushReadiness({ browserSupported:true, vapidKey:' public-key ' }), {
    supported:true, configured:true
  });
});
