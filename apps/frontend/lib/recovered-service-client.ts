'use client';

import {
  api as coreApi,
  type ProductListing as CoreProductListing,
  type PublicBusinessProfile as CorePublicBusinessProfile,
} from './api-client';

export type PublicBusinessProfile = CorePublicBusinessProfile & {
  readonly ratingCount?: number;
};

export type ProductListing = CoreProductListing & {
  readonly requiresPrescription: boolean;
  readonly controlledItem: boolean;
};

export type FulfillmentOrderStatus =
  | 'placed'
  | 'quoted'
  | 'merchant_confirmed'
  | 'courier_assigned'
  | 'courier_accepted'
  | 'ready_for_pickup'
  | 'picked_up'
  | 'delivered'
  | 'rejected'
  | 'cancelled';

export interface FulfillmentOrderItem {
  readonly productListingId: string;
  readonly titleAr: string;
  readonly unitPrice: number;
  readonly quantity: number;
  readonly requiresPrescription: boolean;
}

export interface FulfillmentOrder {
  readonly id: string;
  readonly merchantBusinessId: string;
  readonly merchantName: string;
  readonly pickupAddress?: string;
  readonly merchantPhone?: string;
  readonly courierBusinessId?: string;
  readonly courierName?: string;
  readonly courierPhone?: string;
  readonly vertical: 'food' | 'grocery' | 'pharmacy';
  readonly status: FulfillmentOrderStatus;
  readonly paymentMethod: 'cash';
  readonly paymentStatus: 'pending' | 'cash_collected';
  readonly currency: 'SYP' | 'USD';
  readonly subtotal: number;
  readonly deliveryFee?: number;
  readonly total?: number;
  readonly deliveryAddress: string;
  readonly customerPhone?: string;
  readonly deliveryLatitude?: number;
  readonly deliveryLongitude?: number;
  readonly customerNote?: string;
  readonly prescriptionAttested: boolean;
  readonly pharmacyReviewStatus: 'not_required' | 'pending' | 'approved' | 'rejected';
  readonly rejectionReason?: string;
  readonly items: FulfillmentOrderItem[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

type ProductFilters = {
  readonly q?: string;
  readonly categoryCode?: string;
  readonly cityCode?: string;
  readonly businessProfileId?: string;
};

type Tracking = {
  readonly status: FulfillmentOrderStatus;
  readonly location?: {
    readonly latitude: number;
    readonly longitude: number;
    readonly accuracyMeters?: number;
    readonly recordedAt: string;
  };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const raw = (data as { message?: string | string[] }).message ?? `خطأ في الخادم (${response.status})`;
    const message = Array.isArray(raw) ? raw.join('. ') : raw;
    throw Object.assign(new Error(message), { statusCode: response.status });
  }
  return data as T;
}

function normalizeProduct(product: CoreProductListing & { requiresPrescription?: boolean; controlledItem?: boolean }): ProductListing {
  return {
    ...product,
    requiresPrescription: Boolean(product.requiresPrescription),
    controlledItem: Boolean(product.controlledItem),
  } as ProductListing;
}

const products = {
  ...coreApi.products,
  async list(filters: ProductFilters = {}) {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.categoryCode) params.set('categoryCode', filters.categoryCode);
    if (filters.cityCode) params.set('cityCode', filters.cityCode);
    if (filters.businessProfileId) params.set('businessProfileId', filters.businessProfileId);
    const result = await request<{ products: Array<CoreProductListing & { requiresPrescription?: boolean; controlledItem?: boolean }> }>(`/products${params.size ? `?${params}` : ''}`);
    return { products: result.products.map(normalizeProduct) };
  },
  async get(id: string) {
    const result = await request<{ product: CoreProductListing & { requiresPrescription?: boolean; controlledItem?: boolean } }>(`/products/${encodeURIComponent(id)}`);
    return { product: normalizeProduct(result.product) };
  },
};

export const api = {
  ...coreApi,
  products,
  orders: {
    create(
      data: {
        items: Array<{ productListingId: string; quantity: number }>;
        deliveryAddress: string;
        customerPhone: string;
        customerNote?: string;
        prescriptionAttested: boolean;
        deliveryLatitude?: number;
        deliveryLongitude?: number;
      },
      idempotencyKey: string,
    ) {
      return request<{ order: FulfillmentOrder }>('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(data),
      });
    },
    mine() {
      return request<{ orders: FulfillmentOrder[] }>('/orders/mine');
    },
    merchant(businessId: string) {
      return request<{ orders: FulfillmentOrder[] }>(`/orders/merchant?businessId=${encodeURIComponent(businessId)}`);
    },
    courier(businessId: string) {
      return request<{ orders: FulfillmentOrder[] }>(`/orders/courier?businessId=${encodeURIComponent(businessId)}`);
    },
    transition(id: string, status: FulfillmentOrderStatus, data: Record<string, unknown> = {}) {
      return request<{ order: FulfillmentOrder }>(`/orders/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, ...data }),
      });
    },
    rate(id: string, targetType: 'merchant' | 'courier', score: number, comment?: string) {
      return request<{ rated: true }>(`/orders/${encodeURIComponent(id)}/ratings`, {
        method: 'POST',
        body: JSON.stringify({ targetType, score, comment }),
      });
    },
    recordLocation(id: string, location: { latitude: number; longitude: number; accuracy?: number }) {
      return request<{ recorded: true }>(`/orders/${encodeURIComponent(id)}/location`, {
        method: 'POST',
        body: JSON.stringify(location),
      });
    },
    tracking(id: string) {
      return request<Tracking>(`/orders/${encodeURIComponent(id)}/tracking`);
    },
  },
};
