type RouteQuery = Record<string, string | string[] | undefined>;

/** Compatibility routes retain only parameters understood by their destination.
 * Keep malformed filters/bounds intact so the destination can explain the error.
 * Never turn a malformed location into a silently broader query.
 */
export function legacyDiscoveryHref(target: '/categories' | '/map', values: RouteQuery = {}): string {
  const params = new URLSearchParams();
  const keys = ['q', 'cityCode', 'categoryCode', 'category',
    ...(target === '/map' ? ['south', 'west', 'north', 'east'] : ['page'])];
  for (const key of keys) {
    const value = values[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  return params.size ? `${target}?${params}` : target;
}
