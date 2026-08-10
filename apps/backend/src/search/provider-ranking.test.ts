import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicBusinessProfile } from '../business-profiles/business-profile.types';
import { distanceKm, rankProviders } from './provider-ranking';

const base: PublicBusinessProfile = {
  id: 'provider-1', name: 'صيانة المكيفات', visibility: 'public', trustStatus: 'approved', status: 'active',
  categoryCode: 'maintenance', cityCode: 'damascus', countryCode: 'sy', isFeatured: false, createdAt: new Date(0).toISOString()
};

test('distance uses geographic coordinates', () => {
  assert.equal(distanceKm(33.5138, 36.2765, 33.5138, 36.2765), 0);
  assert.ok(distanceKm(33.5138, 36.2765, 34.8, 38.9) > 200);
});

test('matching prioritizes relevant nearby available highly-rated providers', () => {
  const ranked = rankProviders([
    { ...base, id: 'far', name: 'خدمات عامة', lat: 34.8, lng: 38.9, availability: 'busy', rating: 2 },
    { ...base, id: 'best', lat: 33.514, lng: 36.277, availability: 'available', rating: 4.9, responseSpeedMinutes: 5 }
  ], 'صيانة المكيفات', { latitude: 33.5138, longitude: 36.2765 });
  assert.equal(ranked[0].id, 'best');
  assert.ok((ranked[0].matchScore ?? 0) > (ranked[1].matchScore ?? 0));
  assert.ok((ranked[0].distanceKm ?? 1) < 1);
});
