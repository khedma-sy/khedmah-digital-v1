import { readDiscoveryContext, type DiscoveryContext } from './discovery-context';

export type MapBounds = Readonly<{ south: number; west: number; north: number; east: number }>;
export type MapContext = Omit<DiscoveryContext, 'page'> & Readonly<{
  boundaries?: MapBounds;
  invalidBounds: boolean;
}>;
const BOUND_KEYS = ['south', 'west', 'north', 'east'] as const;

/** Match the existing search endpoint, which does not support dateline wrapping. */
export function validMapBounds(bounds: MapBounds): boolean {
  return BOUND_KEYS.every((key) => Number.isFinite(bounds[key]))
    && Math.abs(bounds.south) <= 90 && Math.abs(bounds.north) <= 90
    && Math.abs(bounds.west) <= 180 && Math.abs(bounds.east) <= 180
    && bounds.south < bounds.north && bounds.west < bounds.east;
}

export function readMapContext(params: Pick<URLSearchParams, 'get'>): MapContext {
  const { q, cityCode, categoryCode } = readDiscoveryContext(params);
  const raw = BOUND_KEYS.map((key) => params.get(key));
  if (raw.every((value) => value === null)) return { q, cityCode, categoryCode, invalidBounds: false };
  const [south, west, north, east] = raw.map(Number);
  const boundaries = { south, west, north, east };
  if (raw.some((value) => value === null || !value.trim()) || !validMapBounds(boundaries)) {
    return { q, cityCode, categoryCode, invalidBounds: true };
  }
  return { q, cityCode, categoryCode, boundaries, invalidBounds: false };
}

export function mapContextKey(context: MapContext): string {
  return JSON.stringify([context.q, context.cityCode, context.categoryCode,
    context.boundaries ? BOUND_KEYS.map((key) => context.boundaries![key]) : null, context.invalidBounds]);
}

/** Route changes carry supported filters only; list pagination and old viewports do not leak across pages. */
export function mapHref(context: Pick<DiscoveryContext, 'q' | 'cityCode' | 'categoryCode'> & { boundaries?: MapBounds }): string {
  const params = new URLSearchParams();
  for (const key of ['q', 'cityCode', 'categoryCode'] as const) {
    if (context[key].trim()) params.set(key, context[key].trim());
  }
  if (context.boundaries && validMapBounds(context.boundaries)) {
    for (const key of BOUND_KEYS) params.set(key, String(context.boundaries[key]));
  }
  return params.size ? `/map?${params}` : '/map';
}

/** Camera fitting uses only published provider coordinates, never inferred city/GPS coordinates. */
export function providerBounds(providers: readonly { lat?: number; lng?: number }[]): MapBounds | undefined {
  const points = providers.filter((item) => item.lat !== undefined && item.lng !== undefined
    && Number.isFinite(item.lat) && Number.isFinite(item.lng) && Math.abs(item.lat) <= 90 && Math.abs(item.lng) <= 180);
  if (!points.length) return undefined;
  const south = Math.min(...points.map((item) => item.lat!));
  const north = Math.max(...points.map((item) => item.lat!));
  const west = Math.min(...points.map((item) => item.lng!));
  const east = Math.max(...points.map((item) => item.lng!));
  return { south: Math.max(-90, south - .005), north: Math.min(90, north + .005),
    west: Math.max(-180, west - .005), east: Math.min(180, east + .005) };
}
