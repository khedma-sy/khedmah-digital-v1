export type MobilityServiceType = 'taxi' | 'delivery';
export type MobilityRequestStatus = 'requested' | 'accepted' | 'en_route' | 'arrived' | 'in_progress' | 'completed' | 'rejected' | 'cancelled';

export interface MobilityFarePolicy {
  readonly serviceType: MobilityServiceType;
  readonly enabled: boolean;
  readonly currency: 'SYP';
  readonly baseFare: number;
  readonly perKmFare: number;
  readonly perWaitingMinuteFare: number;
  readonly minimumFare: number;
  readonly approvedAt?: string;
  readonly updatedAt: string;
}

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
  readonly arrivedAt?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly closedAt?: string;
  readonly routeDistanceMeters?: number;
  readonly waitingSeconds?: number;
  readonly fareStatus: 'pending' | 'finalized' | 'unavailable';
  readonly fareCurrency: 'SYP';
  readonly baseFare?: number;
  readonly farePerKm?: number;
  readonly farePerWaitingMinute?: number;
  readonly fareMinimum?: number;
  readonly farePolicyUpdatedAt?: string;
  readonly distanceFare?: number;
  readonly waitingFare?: number;
  readonly finalFare?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type PublicMobilityRequest = Omit<MobilityRequest, 'providerOwnerUserId' | 'riderUserId' | 'providerPhone' | 'riderContactPhone'> & {
  readonly providerPhone?: string;
  readonly riderContactPhone?: string;
};
