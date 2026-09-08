import { discoveryContextKey, discoveryPage, readDiscoveryContext, type DiscoveryContext } from './discovery-context';

export type SearchTab = 'all' | 'business' | 'professional' | 'service';
export type SearchState = DiscoveryContext & Readonly<{ tab: SearchTab; requested: boolean }>;
export const SEARCH_PAGE_SIZE = 20;

export function searchTab(value: string | null): SearchTab {
  return value === 'business' || value === 'professional' || value === 'service' ? value : 'all';
}

export function readSearchState(params: Pick<URLSearchParams, 'get'>): SearchState {
  const context = readDiscoveryContext(params);
  const tab = searchTab(params.get('type'));
  return {
    ...context, tab,
    categoryCode: tab === 'professional' ? '' : context.categoryCode,
    requested: !!(context.q || context.cityCode || context.categoryCode || params.get('type') || params.get('page'))
  };
}

export function searchStateKey(state: SearchState): string {
  return JSON.stringify([discoveryContextKey(state), state.tab, state.requested]);
}

/** Only known local routes are emitted. User text is encoded as query data. */
export function searchHref(
  state: DiscoveryContext & Readonly<{ tab: SearchTab }>,
  current?: Pick<URLSearchParams, 'toString'>
): string {
  const params = new URLSearchParams(current?.toString());
  for (const key of ['q', 'cityCode', 'category', 'categoryCode', 'type', 'page']) params.delete(key);
  if (state.q.trim()) params.set('q', state.q.trim());
  if (state.cityCode.trim()) params.set('cityCode', state.cityCode.trim());
  if (state.categoryCode.trim() && state.tab !== 'professional') params.set('categoryCode', state.categoryCode.trim());
  // An explicit unfiltered submission differs from the unsearched /search landing.
  params.set('type', state.tab);
  const page = discoveryPage(String(state.page));
  if (page > 1) params.set('page', String(page));
  return `/search?${params}`;
}

export function searchPagination(tab: SearchTab, page: number, total: number, counts: {
  businesses: number; services: number; professionals: number;
}) {
  if (tab === 'business' || tab === 'service') {
    const totalPages = Math.ceil(total / SEARCH_PAGE_SIZE);
    return { totalPages, canNext: page < totalPages };
  }
  // Combined search paginates each collection independently. Professional search
  // has no total. Do not invent numbered pages from a sum or a current-page count.
  const fullPage = tab === 'professional'
    ? counts.professionals === SEARCH_PAGE_SIZE
    : counts.businesses === SEARCH_PAGE_SIZE || counts.services === SEARCH_PAGE_SIZE;
  const minimumSeen = (page - 1) * SEARCH_PAGE_SIZE + counts.businesses + counts.services;
  return { totalPages: null, canNext: fullPage && (tab === 'professional' || total > minimumSeen) };
}
