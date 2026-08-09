import { PublicBusinessProfile } from '../business-profiles/business-profile.types';

export function distanceKm(latitude: number, longitude: number, providerLatitude: number, providerLongitude: number): number {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(providerLatitude - latitude);
  const dLng = radians(providerLongitude - longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latitude)) * Math.cos(radians(providerLatitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** IQ100000 ranking: normalized service, proximity, availability, trust and responsiveness signals. */
export function rankProviders(providers: readonly PublicBusinessProfile[], query: string | undefined, location?: { latitude: number; longitude: number }) {
  const terms = (query ?? '').trim().toLocaleLowerCase('ar').split(/\s+/).filter(Boolean);
  return providers.map((provider) => {
    const searchable = `${provider.name} ${provider.descriptionAr ?? ''} ${provider.categoryCode}`.toLocaleLowerCase('ar');
    const serviceMatch = terms.length ? terms.filter((term) => searchable.includes(term)).length / terms.length : 0.5;
    const distance = location && provider.lat !== undefined && provider.lng !== undefined
      ? distanceKm(location.latitude, location.longitude, provider.lat, provider.lng) : undefined;
    const proximity = distance === undefined ? 0.25 : Math.max(0, 1 - distance / Math.max(provider.serviceRadius ?? 25, 1));
    const availability = provider.availability === 'available' ? 1 : provider.availability === 'busy' ? 0.45 : 0;
    const rating = (provider.rating ?? 0) / 5;
    const response = Math.max(0, 1 - (provider.responseSpeedMinutes ?? 1440) / 1440);
    const trust = provider.trustStatus === 'approved' ? 1 : 0;
    const matchScore = serviceMatch * 40 + proximity * 25 + availability * 15 + rating * 10 + response * 5 + trust * 5;
    return { ...provider, distanceKm: distance === undefined ? undefined : Math.round(distance * 10) / 10, matchScore: Math.round(matchScore * 10) / 10 };
  }).sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0) || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || (b.rating ?? 0) - (a.rating ?? 0));
}
