export type TaxiAddress = { area: string; detail: string; latitude: number; longitude: number };
export type TaxiQuote = {
  id: string; currency: string; totalMinor: number; expiresAt: number; distanceMeters?: number;
  priceBasis: 'metered'; request: { pickup: TaxiAddress; dropoff: TaxiAddress };
};
export type TaxiTrip = {
  id: string; customerId: string; phase: 'submitted'|'accepted'|'in_progress'|'completed'|'cancelled'|'rejected';
  delivery: { state: 'requested'|'assigned'|'at_pickup'|'in_transit'|'at_destination'|'delivered'|'cancelled'; providerId?: string };
  quote: TaxiQuote; version: number;
  cash: { expectedMinor: number; collectedMinor: number; status: 'uncollected'|'collected'|'discrepancy'|'settled' };
  taxiAssignment?: { vehicleId: string; driverRevision: string; vehicleRevision: string };
  rideStartedAt?: number; rating?: number;
};
export type TaxiOfferResponse = { offers: TaxiTrip[]; limit: number };
export type TaxiAuthorization = { proofId: string | null; orderId: string; version: number };
export type TaxiApiError = Error & { statusCode?: number; code?: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const raw = (body as { message?: string | string[] }).message;
    const message = Array.isArray(raw) ? raw.join('. ') : raw || `تعذر إكمال الطلب (${response.status}).`;
    throw Object.assign(new Error(message), { statusCode: response.status, code: (body as { code?: string }).code });
  }
  return body as T;
}

const body = (value: unknown) => ({ method: 'POST', body: JSON.stringify(value) });
const key = () => crypto.randomUUID();

export const taxiApi = {
  rider: {
    access: () => request<{ id: string; role: 'customer' }>('/taxi/rider/access'),
    quote: (pickup: TaxiAddress, dropoff: TaxiAddress) => request<TaxiQuote>('/taxi/rider/quotes', body({ pickup, dropoff })),
    place: (quoteId: string, requestId: string) => request<TaxiTrip>('/taxi/rider/trips', body({ quoteId, requestId })),
    read: (id: string) => request<TaxiTrip>(`/taxi/rider/trips/${encodeURIComponent(id)}`),
    command: (id: string, action: 'cancel'|'rate', expectedVersion: number, extra: Record<string, unknown> = {}) =>
      request<TaxiTrip>(`/taxi/rider/trips/${encodeURIComponent(id)}/actions`, body({ action, expectedVersion, requestId: key(), ...extra })),
    consent: (id: string, expectedVersion: number) => request<{ proofId: string; orderId: string; version: number }>(
      `/taxi/rider/trips/${encodeURIComponent(id)}/consent`, body({ expectedVersion }))
  },
  driver: {
    access: () => request<{ id: string; role: 'driver'; vehicleId: string; zone: string }>('/taxi/driver/access'),
    offers: () => request<TaxiOfferResponse>('/taxi/driver/offers'),
    read: (id: string) => request<TaxiTrip>(`/taxi/driver/trips/${encodeURIComponent(id)}`),
    accept: (id: string, expectedVersion: number) => request<TaxiTrip>(`/taxi/driver/trips/${encodeURIComponent(id)}/actions`, body({ action: 'accept_job', expectedVersion, requestId: key() })),
    release: (id: string, expectedVersion: number, reason: string) => request<TaxiTrip>(`/taxi/driver/trips/${encodeURIComponent(id)}/actions`, body({ action: 'release_job', expectedVersion, requestId: key(), reason })),
    authorization: (id: string) => request<TaxiAuthorization>(`/taxi/driver/trips/${encodeURIComponent(id)}/authorization`),
    start: (id: string, expectedVersion: number, proofId: string) => request<TaxiTrip>(`/taxi/driver/trips/${encodeURIComponent(id)}/actions`, body({ action: 'start_ride', expectedVersion, requestId: key(), proofId }))
  }
};
