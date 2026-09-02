export type MobilityServiceType = 'taxi' | 'delivery';
export type MobilityRequestStatus = 'requested' | 'accepted' | 'en_route' | 'completed' | 'rejected' | 'cancelled';

export interface MobilityRequest {
  readonly id: string;
  readonly riderUserId: string;
  readonly providerBusinessId: string;
  readonly providerOwnerUserId?: string;
  readonly providerName?: string;
  readonly providerPhone?: string;
  readonly serviceType: MobilityServiceType;
  readonly pickupAddress: string;
  readonly destinationAddress: string;
  readonly riderContactPhone: string;
  readonly pickupLatitude: number;
  readonly pickupLongitude: number;
  readonly destinationLatitude?: number;
  readonly destinationLongitude?: number;
  readonly riderNote?: string;
  readonly status: MobilityRequestStatus;
  readonly acceptedAt?: string;
  readonly enRouteAt?: string;
  readonly completedAt?: string;
  readonly closedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type PublicMobilityRequest = Omit<MobilityRequest, 'providerOwnerUserId' | 'riderUserId'>;
