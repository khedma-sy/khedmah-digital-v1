import type { ProductListing } from './api-client';

export type StoreProductSort = 'newest' | 'price_asc' | 'price_desc';
export type StoreProductFilters = {
  q?: string;
  categoryCode?: string;
  cityCode?: string;
  availability?: ProductListing['availability'];
  currency?: ProductListing['currency'];
  minPrice?: number;
  maxPrice?: number;
  sort?: StoreProductSort;
};

export async function listStoreProducts(filters: StoreProductFilters = {}): Promise<ProductListing[]> {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.categoryCode) params.set('categoryCode', filters.categoryCode);
  if (filters.cityCode) params.set('cityCode', filters.cityCode);
  if (filters.availability) params.set('availability', filters.availability);
  if (filters.currency) params.set('currency', filters.currency);
  if (filters.minPrice !== undefined) params.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set('maxPrice', String(filters.maxPrice));
  if (filters.sort && filters.sort !== 'newest') params.set('sort', filters.sort);

  const response = await fetch(`/api/v1/products${params.size ? `?${params}` : ''}`, { credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as { message?: string | string[] }).message ?? `خطأ في الخادم (${response.status})`;
    throw new Error(Array.isArray(message) ? message.join('. ') : message);
  }
  const products = (data as { products?: unknown }).products;
  if (!Array.isArray(products)) throw new Error('تعذر قراءة قائمة المنتجات. أعد المحاولة.');
  return products as ProductListing[];
}
