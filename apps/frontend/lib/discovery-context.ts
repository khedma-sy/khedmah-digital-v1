/** URL values stay strings until the relevant API validates its governed codes. */
export type DiscoveryContext = Readonly<{
  q: string;
  cityCode: string;
  categoryCode: string;
  page: number;
}>;
type QueryReader = Pick<URLSearchParams, 'get'>;

export function discoveryPage(value: string | null): number {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

export function readDiscoveryContext(params: QueryReader): DiscoveryContext {
  return {
    q: (params.get('q') ?? '').trim(),
    cityCode: (params.get('cityCode') ?? '').trim(),
    // Presence takes precedence: an explicitly empty canonical key clears a legacy value.
    categoryCode: (params.get('categoryCode') ?? params.get('category') ?? '').trim(),
    page: discoveryPage(params.get('page'))
  };
}

export function discoveryContextKey(context: DiscoveryContext): string {
  return JSON.stringify([context.q, context.cityCode, context.categoryCode, context.page]);
}

/** Change directory filters without dropping the city, query or unrelated URL context. */
export function categoryDirectoryHref(
  current: Pick<URLSearchParams, 'toString'>,
  categoryCode: string,
  page: number
): string {
  const params = new URLSearchParams(current.toString());
  const { q, cityCode } = readDiscoveryContext(params);
  params.delete('category');
  params.delete('categoryCode');
  params.delete('page');
  q ? params.set('q', q) : params.delete('q');
  cityCode ? params.set('cityCode', cityCode) : params.delete('cityCode');
  if (categoryCode.trim()) params.set('categoryCode', categoryCode.trim());
  const nextPage = discoveryPage(String(page));
  if (nextPage > 1) params.set('page', String(nextPage));
  return params.size ? `/categories?${params}` : '/categories';
}
