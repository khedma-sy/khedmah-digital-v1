import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { getRequestContext } from '../context/request-context';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { PlatformLogger } from '../logging/platform-logger';
import { ContactAbuseService } from './contact-abuse.service';
import { ContactBusinessUnavailableError, ContactAccessError, ContactRateLimitError } from './contact.errors';
import { ContactRateLimitService } from './contact-rate-limit.service';
import { ContactRepository } from './contact.repository';
import { ContactActionEvent, ContactBusinessProfileSnapshot, ContactInquiry, PublicContactActionReceipt, PublicContactInquiryReceipt } from './contact.types';
import { SubmitContactInquiryRequest, TrackContactClickRequest } from './dto/contact.dto';
import { validateBusinessProfileId, validateSubmitContactInquiry, validateTrackContactClick } from './contact.validation';

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

  submitInquiry(cookieHeader: string | undefined, businessProfileIdValue: string, request: SubmitContactInquiryRequest): PublicContactInquiryReceipt {
    const actor = this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const businessProfileId = validateBusinessProfileId(businessProfileIdValue);
    const business = this.requirePublicApprovedBusiness(businessProfileId);
    const input = validateSubmitContactInquiry(request);
    const rateLimit = this.rateLimits.check(`inquiry:${actor.id}:${business.id}`);

    if (!rateLimit.allowed) {
      this.audit('contact.inquiry.rate_limited', actor.id);
      throw new ContactRateLimitError();
    }

    if (this.abuse.shouldBlockInquiry(input)) {
      this.audit('contact.inquiry.abuse_blocked', actor.id);
      throw new ContactAccessError();
    }

    const requestContext = getRequestContext();
    const now = new Date().toISOString();
    const inquiry: ContactInquiry = {
      id: randomUUID(),
      businessProfileId: business.id,
      submitterUserId: actor.id,
      name: input.name,
      contactEmail: input.contactEmail,
      message: input.message,
      status: 'submitted',
      createdAt: now,
      requestId: requestContext?.requestId,
      correlationId: requestContext?.correlationId
    };

    this.contacts.saveContactInquiry(inquiry);
    this.audit('contact.inquiry.submitted', actor.id);
    this.logContactEvent('contact_inquiry_submitted', business.id);

    return this.toPublicInquiryReceipt(inquiry);
  }

  trackContactClick(cookieHeader: string | undefined, businessProfileIdValue: string, request: TrackContactClickRequest): PublicContactActionReceipt {
    const actor = this.identity.getSession(readSessionToken(cookieHeader));
    const businessProfileId = validateBusinessProfileId(businessProfileIdValue);
    const business = this.requirePublicApprovedBusiness(businessProfileId);
    validateTrackContactClick(request);
    const rateLimit = this.rateLimits.check(`contact-click:${actor?.id ?? 'anonymous'}:${business.id}`);

    if (!rateLimit.allowed) {
      this.audit('contact.click.rate_limited', actor?.id);
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

    this.contacts.saveContactAction(event);
    this.audit('contact.click.tracked', actor?.id);
    this.logContactEvent('contact_click_tracked', business.id);

    return {
      id: event.id,
      businessProfileId: event.businessProfileId,
      actionType: event.actionType,
      trackedAt: event.createdAt
    };
  }

  private requirePublicApprovedBusiness(businessProfileId: string): ContactBusinessProfileSnapshot {
    const business = this.contacts.findBusinessProfileSnapshot(businessProfileId);
    if (!business || business.visibility !== 'public' || business.trustStatus !== 'approved') {
      throw new ContactBusinessUnavailableError();
    }

    return business;
  }

  private toPublicInquiryReceipt(inquiry: ContactInquiry): PublicContactInquiryReceipt {
    return {
      id: inquiry.id,
      businessProfileId: inquiry.businessProfileId,
      status: inquiry.status,
      createdAt: inquiry.createdAt
    };
  }

  private audit(eventType: Parameters<IdentityRepository['appendAuditLog']>[0], actorUserId?: string): void {
    const requestContext = getRequestContext();
    this.identityRepository.appendAuditLog(eventType, {
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
