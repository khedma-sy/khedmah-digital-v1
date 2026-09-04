import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { BusinessProfileRepository } from '../business-profiles/business-profile.repository';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { NotificationService } from '../notifications/notification.service';
import { MobilityRepository } from './mobility.repository';
import { MobilityDistanceService } from './mobility-distance.service';
import type { CreatedMobilityRequest, MobilityFarePolicy, MobilityRequest, MobilityRequestStatus, MobilityServiceType, PublicMobilityRequest } from './mobility.types';
import { validateCreateMobilityRequest, validateFarePolicy, validateMobilityIdempotencyKey, validateMobilityTransition } from './mobility.validation';

const providerTransitions: Partial<Record<MobilityRequestStatus, readonly MobilityRequestStatus[]>> = {
  requested: ['accepted', 'rejected'], accepted: ['en_route'], en_route: ['arrived'], arrived: ['in_progress'], in_progress: ['completed']
};
const riderTransitions: Partial<Record<MobilityRequestStatus, readonly MobilityRequestStatus[]>> = {
  requested: ['cancelled'], accepted: ['cancelled']
};

@Injectable()
export class MobilityService {
  constructor(
    @Inject(MobilityRepository) private readonly repository: MobilityRepository,
    @Inject(BusinessProfileRepository) private readonly businesses: BusinessProfileRepository,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(IdentityRepository) private readonly audits: IdentityRepository,
    @Inject(OperationsRbacService) private readonly rbac: OperationsRbacService,
    @Inject(MobilityDistanceService) private readonly distance: MobilityDistanceService,
    @Inject(NotificationService) private readonly notifications?: NotificationService
  ) {}

  async create(cookie: string | undefined, value: Record<string, unknown>, idempotencyValue: unknown): Promise<CreatedMobilityRequest> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const input = validateCreateMobilityRequest(value);
    const idempotencyKey = validateMobilityIdempotencyKey(idempotencyValue);
    const prior = await this.repository.findByRiderIdempotency(actor.id, idempotencyKey);
    if (prior) {
      if (!sameRequestPayload(prior, input)) throw new BadRequestException('Idempotency-Key was already used for a different mobility request.');
      return publicRequest(prior, 'rider');
    }
    const business = await this.businesses.findById(input.providerBusinessId);
    const expectedCategory = input.serviceType === 'taxi' ? 'taxi' : 'delivery_courier';
    if (!business || business.categoryCode !== expectedCategory || business.visibility !== 'public' || business.moderationStatus !== 'approved' || business.trustStatus !== 'approved' || business.status !== 'active') {
      throw new BadRequestException('The selected mobility provider is not eligible for requests.');
    }
    if (await this.businesses.countApprovedMobilityDocuments(business.id) !== 4) {
      throw new BadRequestException('The selected mobility provider does not have four approved driver documents.');
    }
    if (business.ownerUserId === actor.id) throw new BadRequestException('You cannot request your own mobility business.');
    const now = new Date().toISOString();
    const pickupCode = input.serviceType === 'delivery' ? createVerificationCode() : undefined;
    const deliveryCode = input.serviceType === 'delivery' ? createVerificationCode() : undefined;
    const request: MobilityRequest = { id: randomUUID(), riderUserId: actor.id, ...input,
      pickupVerificationHash: pickupCode ? hashVerificationCode(pickupCode) : undefined,
      deliveryVerificationHash: deliveryCode ? hashVerificationCode(deliveryCode) : undefined,
      deliveryContractVersion: input.serviceType === 'delivery' ? 2 : 1,
      status: 'requested', fareStatus:'pending', fareCurrency:'SYP', createdAt: now, updatedAt: now };
    try {
      const created = await this.repository.create(request, idempotencyKey);
      await this.audits.appendAuditLog('mobility.request.created', { actorUserId: actor.id, correlationId: created.id });
      await this.notifications?.publish({ userId: business.ownerUserId, eventKey: `${created.id}:requested:${business.ownerUserId}`,
        eventType: 'mobility.created', referenceType: 'mobility', referenceId: created.id,
        title: created.serviceType === 'taxi' ? 'طلب رحلة جديد' : 'مهمة توصيل جديدة',
        body: created.serviceType === 'taxi' ? 'وصلك طلب تكسي جديد.' : 'وصلك طلب استلام وتسليم جديد.',
        metadata: { status: created.status, serviceType: created.serviceType } });
      return { ...publicRequest(created, 'rider'), pickupProofPin:pickupCode, deliveryProofPin:deliveryCode };
    } catch (error) {
      const retry = await this.repository.findByRiderIdempotency(actor.id, idempotencyKey);
      if (retry) return publicRequest(retry, 'rider');
      if (isUniqueViolation(error)) throw new BadRequestException('You already have an open mobility request.');
      throw error;
    }
  }

  async listMine(cookie: string | undefined): Promise<PublicMobilityRequest[]> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    return (await this.repository.listForRider(actor.id)).map(request => publicRequest(request, 'rider'));
  }

  async listForProvider(cookie: string | undefined, businessId: string): Promise<PublicMobilityRequest[]> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const business = await this.businesses.findById(businessId);
    if (!business) throw new NotFoundException('Mobility business was not found.');
    if (business.ownerUserId !== actor.id) throw new ForbiddenException('Access denied.');
    return (await this.repository.listForProvider(businessId)).map(request => publicRequest(request, 'provider'));
  }

  async transition(cookie: string | undefined, id: string, value: Record<string, unknown>): Promise<PublicMobilityRequest> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const input = validateMobilityTransition(value);
    const request = await this.repository.findById(id);
    if (!request) throw new NotFoundException('Mobility request was not found.');
    const isRider = request.riderUserId === actor.id;
    const isProvider = request.providerOwnerUserId === actor.id;
    if (!isRider && !isProvider) throw new ForbiddenException('Access denied.');
    const allowed = isProvider ? providerTransitions[request.status] : riderTransitions[request.status];
    if (!allowed?.includes(input.status)) throw new BadRequestException('This mobility status transition is not allowed.');
    let proof: Parameters<MobilityRepository['transition']>[6];
    if (request.serviceType === 'delivery' && request.deliveryContractVersion === 2 && input.status === 'in_progress') {
      requireVerificationCode(input.verificationCode, request.pickupVerificationHash, 'pickup');
      proof = { pickupVerified:true };
    } else if (request.serviceType === 'delivery' && request.deliveryContractVersion === 2 && input.status === 'completed') {
      if (!request.pickupVerifiedAt) throw new BadRequestException('Pickup must be verified before delivery.');
      requireVerificationCode(input.verificationCode, request.deliveryVerificationHash, 'delivery');
      proof = { deliveryVerified:true };
    } else if (input.verificationCode) {
      throw new BadRequestException('A verification code is not valid for this transition.');
    }
    let fare: Parameters<MobilityRepository['transition']>[5];
    if (input.status === 'in_progress') {
      const policy = await this.requireActiveFarePolicy(request.serviceType);
      fare = { baseFare:policy.baseFare, perKmFare:policy.perKmFare, perWaitingMinuteFare:policy.perWaitingMinuteFare, minimumFare:policy.minimumFare, policyUpdatedAt:policy.updatedAt };
    }
    if (input.status === 'completed') {
      const distanceMeters = await this.distance.calculate(request);
      if (!request.arrivedAt || !request.startedAt) throw new BadRequestException('The trip meter has not started correctly.');
      if (request.baseFare === undefined || request.farePerKm === undefined || request.farePerWaitingMinute === undefined || request.fareMinimum === undefined || !request.farePolicyUpdatedAt) {
        throw new BadRequestException('The trip fare snapshot is missing; an administrator must review this request.');
      }
      const waitingSeconds = Math.max(0, Math.min(86_400, Math.round((Date.parse(request.startedAt) - Date.parse(request.arrivedAt)) / 1000)));
      const distanceFare = Math.round(distanceMeters * request.farePerKm / 1000);
      const waitingFare = Math.ceil(waitingSeconds / 60) * request.farePerWaitingMinute;
      fare = { distanceMeters, waitingSeconds, baseFare:request.baseFare, perKmFare:request.farePerKm, perWaitingMinuteFare:request.farePerWaitingMinute,
        minimumFare:request.fareMinimum, policyUpdatedAt:request.farePolicyUpdatedAt, distanceFare, waitingFare,
        finalFare:Math.max(request.fareMinimum, request.baseFare + distanceFare + waitingFare) };
    }
    const updated = await this.repository.transition(request, request.status, input.status, actor.id, input.reason, fare, proof);
    if (!updated) throw new BadRequestException('The mobility request changed; refresh and try again.');
    await this.audits.appendAuditLog('mobility.request.status_changed', { actorUserId: actor.id, correlationId: request.id });
    const recipientId = isProvider ? request.riderUserId : request.providerOwnerUserId;
    if (recipientId) await this.notifications?.publish({ userId: recipientId, eventKey: `${updated.id}:${updated.status}:${recipientId}`,
      eventType: 'mobility.status_changed', referenceType: 'mobility', referenceId: updated.id,
      title: mobilityNotificationTitle(updated), body: mobilityNotificationBody(updated),
      metadata: { status: updated.status, serviceType: updated.serviceType } });
    return publicRequest(updated, isProvider ? 'provider' : 'rider');
  }

  async farePolicy(serviceType: unknown): Promise<MobilityFarePolicy> {
    if (serviceType !== 'taxi' && serviceType !== 'delivery') throw new BadRequestException('serviceType is invalid.');
    const policy = await this.repository.findFarePolicy(serviceType);
    if (!policy) throw new NotFoundException('Mobility fare policy was not found.');
    return policy;
  }

  async updateFarePolicy(cookie: string | undefined, value: Record<string, unknown>): Promise<MobilityFarePolicy> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    this.rbac.assert(actor.email, 'security.manage');
    const input = validateFarePolicy(value);
    const policy = await this.repository.saveFarePolicy(input, actor.id);
    await this.audits.appendAuditLog('mobility.fare_policy.updated', { actorUserId:actor.id, correlationId:input.serviceType });
    return policy;
  }

  private async requireActiveFarePolicy(serviceType: MobilityServiceType): Promise<MobilityFarePolicy> {
    const policy = await this.repository.findFarePolicy(serviceType);
    if (!policy?.enabled) throw new BadRequestException('Platform fare policy is not active yet.');
    return policy;
  }
}

function mobilityNotificationTitle(request: MobilityRequest): string {
  const delivery = request.serviceType === 'delivery';
  const titles: Record<MobilityRequestStatus, string> = {
    requested: delivery ? 'مهمة توصيل جديدة' : 'طلب رحلة جديد', accepted: 'قُبل الطلب',
    en_route: delivery ? 'المندوب في طريقه للاستلام' : 'السائق في الطريق',
    arrived: delivery ? 'وصل المندوب إلى نقطة الاستلام' : 'وصل السائق',
    in_progress: delivery ? 'تم استلام الطرد' : 'بدأت الرحلة',
    completed: delivery ? 'تم تسليم الطرد' : 'اكتملت الرحلة', rejected: 'رُفض الطلب', cancelled: 'أُلغي الطلب'
  };
  return titles[request.status];
}

function mobilityNotificationBody(request: MobilityRequest): string {
  return request.serviceType === 'delivery'
    ? `تحديث طلب التوصيل: ${request.pickupAddress} ← ${request.destinationAddress}`
    : `تحديث الرحلة: ${request.pickupAddress} ← ${request.destinationAddress}`;
}

function publicRequest(request: MobilityRequest, audience: 'rider' | 'provider'): PublicMobilityRequest {
  const { providerOwnerUserId: _providerOwnerUserId, riderUserId: _riderUserId, providerPhone, riderContactPhone,
    recipientPhone, pickupVerificationHash: _pickupVerificationHash, deliveryVerificationHash: _deliveryVerificationHash, ...result } = request;
  const matched = !['requested','rejected','cancelled'].includes(request.status);
  return { ...result, providerPhone: audience === 'rider' && matched ? providerPhone : undefined,
    riderContactPhone: audience === 'provider' && matched ? riderContactPhone : undefined,
    recipientPhone: audience === 'rider' || matched ? recipientPhone : undefined };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
}

function sameRequestPayload(request: MobilityRequest, input: ReturnType<typeof validateCreateMobilityRequest>): boolean {
  return request.providerBusinessId === input.providerBusinessId && request.serviceType === input.serviceType
    && request.pickupAddress === input.pickupAddress && request.destinationAddress === input.destinationAddress
    && request.riderContactPhone === input.riderContactPhone && request.pickupLatitude === input.pickupLatitude
    && request.pickupLongitude === input.pickupLongitude && request.destinationLatitude === input.destinationLatitude
    && request.destinationLongitude === input.destinationLongitude && request.riderNote === input.riderNote
    && request.packageDescription === input.packageDescription && request.packageSize === input.packageSize
    && request.recipientName === input.recipientName && request.recipientPhone === input.recipientPhone
    && request.deliveryInstructions === input.deliveryInstructions;
}

function createVerificationCode(): string { return String(randomInt(0, 1_000_000)).padStart(6, '0'); }

function hashVerificationCode(code: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(code, salt, 32).toString('hex')}`;
}

function requireVerificationCode(code: string | undefined, stored: string | undefined, stage: 'pickup' | 'delivery'): void {
  if (!code || !stored) throw new BadRequestException(`A valid ${stage} verification code is required.`);
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) throw new BadRequestException(`A valid ${stage} verification code is required.`);
  const actual = scryptSync(code, salt, 32);
  const expected = Buffer.from(expectedHex, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(actual, expected)) throw new BadRequestException(`The ${stage} verification code is incorrect.`);
}
