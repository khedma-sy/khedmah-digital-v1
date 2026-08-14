import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { getRequestContext } from '../context/request-context';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { PlatformLogger } from '../logging/platform-logger';
import { ContactAbuseService } from './contact-abuse.service';
import { ContactBusinessUnavailableError, ContactAccessError, ContactIdempotencyConflictError, ContactRateLimitError } from './contact.errors';
import { ContactRateLimitService } from './contact-rate-limit.service';
import { ContactRepository } from './contact.repository';
import { BusinessProfileTrustStatus, BusinessProfileVisibility, ContactActionEvent, ContactBusinessProfileSnapshot, ContactInquiry, ProviderContactInquiry, PublicContactActionReceipt, PublicContactInquiryReceipt } from './contact.types';
import { ContactTarget, SubmitContactInquiryRequest, TrackContactClickRequest } from './dto/contact.dto';
import { validateBusinessProfileId, validateIdempotencyKey, validateSubmitContactInquiry, validateTrackContactClick } from './contact.validation';

@Injectable()
export class ContactService {
  constructor(
    @Inject(ContactRepository) private readonly contacts: ContactRepository,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(IdentityRepository) private readonly identityRepository: IdentityRepository,
    @Inject(ContactRateLimitService) private readonly rateLimits: ContactRateLimitService,
    @Inject(ContactAbuseService) private readonly abuse: ContactAbuseService,
    @Inject(PlatformLogger) private readonly logger: PlatformLogger
  ) {}

  async submitInquiry(cookieHeader: string | undefined, targetValue: ContactTarget, request: SubmitContactInquiryRequest, idempotencyKeyValue: unknown): Promise<PublicContactInquiryReceipt> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const target: ContactTarget = { ...targetValue, id: validateBusinessProfileId(targetValue.id) };
    const input = validateSubmitContactInquiry(request);
    const idempotencyKey = validateIdempotencyKey(idempotencyKeyValue);
    const payloadFingerprint = createHash('sha256').update(JSON.stringify({ target, ...input })).digest('hex');

    const prior = await this.contacts.findIdempotentInquiry(actor.id, idempotencyKey);
    if (prior) {
      if (prior.payloadFingerprint !== payloadFingerprint) throw new ContactIdempotencyConflictError();
      return this.toPublicInquiryReceipt(prior.inquiry);
    }

    await this.requireAvailableTarget(target);

    const rateLimit = this.rateLimits.check(`inquiry:${actor.id}:${target.type}:${target.id}`);

    if (!rateLimit.allowed) {
      await this.audit('contact.inquiry.rate_limited', actor.id);
      throw new ContactRateLimitError();
    }

    if (this.abuse.shouldBlockInquiry(input)) {
      await this.audit('contact.inquiry.abuse_blocked', actor.id);
      throw new ContactAccessError();
    }

    const requestContext = getRequestContext();
    const now = new Date().toISOString();
    const inquiry: ContactInquiry = {
      id: randomUUID(),
      businessProfileId: target.type === 'business' ? target.id : undefined,
      professionalProfileId: target.type === 'professional' ? target.id : undefined,
      submitterUserId: actor.id,
      name: input.name,
      contactEmail: input.contactEmail,
      message: input.message,
      status: 'submitted',
      trackingStatus: 'submitted',
      createdAt: now,
      requestId: requestContext?.requestId,
      correlationId: requestContext?.correlationId
    };

    const saved = await this.contacts.createIdempotentInquiry(inquiry, idempotencyKey, payloadFingerprint);
    if (saved.payloadFingerprint !== payloadFingerprint) throw new ContactIdempotencyConflictError();
    if (saved.created) {
      await this.audit('contact.inquiry.submitted', actor.id);
      this.logContactEvent('contact_inquiry_submitted', target.id);
    }

    return this.toPublicInquiryReceipt(saved.inquiry);
  }

  async trackContactClick(cookieHeader: string | undefined, businessProfileIdValue: string, request: TrackContactClickRequest): Promise<PublicContactActionReceipt> {
    const actor = await this.identity.getSession(readSessionToken(cookieHeader));
    const businessProfileId = validateBusinessProfileId(businessProfileIdValue);
    const business = await this.requirePublicApprovedBusiness(businessProfileId);
    validateTrackContactClick(request);
    const rateLimit = this.rateLimits.check(`contact-click:${actor?.id ?? 'anonymous'}:${business.id}`);

    if (!rateLimit.allowed) {
      await this.audit('contact.click.rate_limited', actor?.id);
      throw new ContactRateLimitError();
    }

    const requestContext = getRequestContext();
    const now = new Date().toISOString();
    const event: ContactActionEvent = {
      id: randomUUID(),
      businessProfileId: business.id,
      actorUserId: actor?.id,
      actionType: 'contact_click',
      createdAt: now,
      requestId: requestContext?.requestId,
      correlationId: requestContext?.correlationId
    };

    await this.contacts.saveContactAction(event);
    await this.audit('contact.click.tracked', actor?.id);
    this.logContactEvent('contact_click_tracked', business.id);

    return {
      id: event.id,
      businessProfileId: event.businessProfileId,
      actionType: event.actionType,
      trackedAt: event.createdAt
    };
  }

  async listReceivedInquiries(cookieHeader: string | undefined, businessProfileIdValue: string): Promise<ProviderContactInquiry[]> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const businessProfileId = validateBusinessProfileId(businessProfileIdValue);
    const business = await this.contacts.findBusinessProfileSnapshot(businessProfileId);
    if (!business) {
      throw new ContactBusinessUnavailableError();
    }
    if (business.ownerUserId !== actor.id) {
      throw new ContactAccessError();
    }

    const inquiries = await this.contacts.listContactInquiries(businessProfileId);
    return inquiries.map((inquiry) => ({
      id: inquiry.id,
      businessProfileId: inquiry.businessProfileId!,
      name: inquiry.name,
      contactEmail: inquiry.contactEmail,
      message: inquiry.message,
      status: inquiry.status,
      createdAt: inquiry.createdAt
    }));
  }

  async listReceivedProfessionalInquiries(cookieHeader: string | undefined, professionalProfileIdValue: string): Promise<ProviderContactInquiry[]> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const professionalProfileId = validateBusinessProfileId(professionalProfileIdValue);
    const professional = await this.contacts.findProfessionalProfileSnapshot(professionalProfileId);
    if (!professional || professional.userIdentifier !== actor.id) throw new ContactAccessError();
    const inquiries = await this.contacts.listProfessionalContactInquiries(professionalProfileId);
    return inquiries.map((inquiry) => ({
      id: inquiry.id, professionalProfileId: inquiry.professionalProfileId,
      name: inquiry.name, contactEmail: inquiry.contactEmail, message: inquiry.message,
      status: inquiry.status, createdAt: inquiry.createdAt
    }));
  }

  private async requirePublicApprovedBusiness(businessProfileId: string): Promise<ContactBusinessProfileSnapshot> {
    const snapshot = await this.contacts.findBusinessProfileSnapshot(businessProfileId);
    const business: ContactBusinessProfileSnapshot | undefined = snapshot
      ? { id: snapshot.id, visibility: snapshot.visibility as BusinessProfileVisibility, moderationStatus: snapshot.moderationStatus, trustStatus: snapshot.trustStatus as BusinessProfileTrustStatus, status: snapshot.status, ownerUserId: snapshot.ownerUserId }
      : undefined;
    if (!business || business.visibility !== 'public' || business.moderationStatus !== 'approved' || business.trustStatus !== 'approved' || business.status !== 'active') {
      throw new ContactBusinessUnavailableError();
    }

    return business;
  }

  private async requireAvailableTarget(target: ContactTarget): Promise<void> {
    if (target.type === 'business') {
      await this.requirePublicApprovedBusiness(target.id);
      return;
    }
    const professional = await this.contacts.findProfessionalProfileSnapshot(target.id);
    if (!professional || professional.visibility !== 'public' || professional.moderationStatus !== 'approved' || professional.lifecycleStatus !== 'active') {
      throw new ContactBusinessUnavailableError();
    }
  }

  private toPublicInquiryReceipt(inquiry: ContactInquiry): PublicContactInquiryReceipt {
    return {
      id: inquiry.id,
      targetType: inquiry.professionalProfileId ? 'professional' : 'business',
      ...(inquiry.businessProfileId ? { businessProfileId: inquiry.businessProfileId } : {}),
      ...(inquiry.professionalProfileId ? { professionalProfileId: inquiry.professionalProfileId } : {}),
      status: inquiry.status,
      trackingStatus: inquiry.trackingStatus,
      createdAt: inquiry.createdAt
    };
  }

  private async audit(eventType: Parameters<IdentityRepository['appendAuditLog']>[0], actorUserId?: string): Promise<void> {
    const requestContext = getRequestContext();
    await this.identityRepository.appendAuditLog(eventType, {
      actorUserId,
      requestId: requestContext?.requestId,
      correlationId: requestContext?.correlationId
    });
  }

  private logContactEvent(event: string, businessProfileId: string): void {
    this.logger.log({
      timestamp: new Date().toISOString(),
      event,
      businessProfileId
    });
  }
}
