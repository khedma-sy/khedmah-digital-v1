import { BadRequestException } from '@nestjs/common';
import type { MobilityRequestStatus, MobilityServiceType } from './mobility.types';

const text = (value: unknown, name: string, min: number, max: number, optional = false) => {
  if ((value === undefined || value === null || value === '') && optional) return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`${name} must be a string.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new BadRequestException(`${name} is invalid.`);
  return normalized;
};

const coordinate = (value: unknown, name: string, min: number, max: number, optional = false) => {
  if ((value === undefined || value === null || value === '') && optional) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new BadRequestException(`${name} is invalid.`);
  return Math.round(value * 1_000_000) / 1_000_000;
};

export function validateCreateMobilityRequest(value: Record<string, unknown>) {
  if (value.serviceType !== 'taxi' && value.serviceType !== 'delivery') throw new BadRequestException('serviceType is invalid.');
  const destinationLatitude = coordinate(value.destinationLatitude, 'destinationLatitude', -90, 90, true);
  const destinationLongitude = coordinate(value.destinationLongitude, 'destinationLongitude', -180, 180, true);
  if ((destinationLatitude === undefined) !== (destinationLongitude === undefined)) throw new BadRequestException('Destination coordinates must be provided together.');
  return {
    providerBusinessId: text(value.providerBusinessId, 'providerBusinessId', 1, 128)!,
    serviceType: value.serviceType as MobilityServiceType,
    pickupAddress: text(value.pickupAddress, 'pickupAddress', 2, 300)!,
    destinationAddress: text(value.destinationAddress, 'destinationAddress', 2, 300)!,
    riderContactPhone: text(value.riderContactPhone, 'riderContactPhone', 6, 30)!,
    pickupLatitude: coordinate(value.pickupLatitude, 'pickupLatitude', -90, 90)!,
    pickupLongitude: coordinate(value.pickupLongitude, 'pickupLongitude', -180, 180)!,
    destinationLatitude,
    destinationLongitude,
    riderNote: text(value.riderNote, 'riderNote', 1, 500, true)
  };
}

export function validateMobilityTransition(value: Record<string, unknown>): { status: MobilityRequestStatus; reason?: string } {
  const allowed: MobilityRequestStatus[] = ['accepted', 'en_route', 'arrived', 'in_progress', 'completed', 'rejected', 'cancelled'];
  if (!allowed.includes(value.status as MobilityRequestStatus)) throw new BadRequestException('Mobility status is invalid.');
  const reason = text(value.reason, 'reason', 3, 300, true);
  if (value.status === 'rejected' && !reason) throw new BadRequestException('A rejection reason is required.');
  return { status: value.status as MobilityRequestStatus, reason };
}

export function validateFarePolicy(value: Record<string, unknown>) {
  if (value.serviceType !== 'taxi' && value.serviceType !== 'delivery') throw new BadRequestException('serviceType is invalid.');
  const integer = (field: string, minimum = 0) => {
    const input = value[field];
    if (typeof input !== 'number' || !Number.isInteger(input) || input < minimum || input > 100_000_000) throw new BadRequestException(`${field} is invalid.`);
    return input;
  };
  if (typeof value.enabled !== 'boolean') throw new BadRequestException('enabled is invalid.');
  const policy = {
    serviceType: value.serviceType as MobilityServiceType,
    enabled: value.enabled,
    baseFare: integer('baseFare'),
    perKmFare: integer('perKmFare'),
    perWaitingMinuteFare: integer('perWaitingMinuteFare'),
    minimumFare: integer('minimumFare')
  };
  if (policy.enabled && (policy.baseFare <= 0 || policy.perKmFare <= 0 || policy.minimumFare < policy.baseFare)) throw new BadRequestException('Enabled fare policy requires valid approved rates.');
  return policy;
}

export function validateMobilityIdempotencyKey(value: unknown): string {
  return text(value, 'Idempotency-Key', 16, 128)!;
}
