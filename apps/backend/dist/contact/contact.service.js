"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const request_context_1 = require("../context/request-context");
const identity_repository_1 = require("../identity/identity.repository");
const identity_service_1 = require("../identity/identity.service");
const session_cookie_1 = require("../identity/session-cookie");
const platform_logger_1 = require("../logging/platform-logger");
const contact_abuse_service_1 = require("./contact-abuse.service");
const contact_errors_1 = require("./contact.errors");
const contact_rate_limit_service_1 = require("./contact-rate-limit.service");
const contact_repository_1 = require("./contact.repository");
const contact_validation_1 = require("./contact.validation");
let ContactService = class ContactService {
    contacts;
    identity;
    identityRepository;
    rateLimits;
    abuse;
    logger;
    constructor(contacts, identity, identityRepository, rateLimits, abuse, logger) {
        this.contacts = contacts;
        this.identity = identity;
        this.identityRepository = identityRepository;
        this.rateLimits = rateLimits;
        this.abuse = abuse;
        this.logger = logger;
    }
    submitInquiry(cookieHeader, businessProfileIdValue, request) {
        const actor = this.identity.getCurrentUser((0, session_cookie_1.readSessionToken)(cookieHeader));
        const businessProfileId = (0, contact_validation_1.validateBusinessProfileId)(businessProfileIdValue);
        const business = this.requirePublicApprovedBusiness(businessProfileId);
        const input = (0, contact_validation_1.validateSubmitContactInquiry)(request);
        const rateLimit = this.rateLimits.check(`inquiry:${actor.id}:${business.id}`);
        if (!rateLimit.allowed) {
            this.audit('contact.inquiry.rate_limited', actor.id);
            throw new contact_errors_1.ContactRateLimitError();
        }
        if (this.abuse.shouldBlockInquiry(input)) {
            this.audit('contact.inquiry.abuse_blocked', actor.id);
            throw new contact_errors_1.ContactAccessError();
        }
        const requestContext = (0, request_context_1.getRequestContext)();
        const now = new Date().toISOString();
        const inquiry = {
            id: (0, node_crypto_1.randomUUID)(),
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
    trackContactClick(cookieHeader, businessProfileIdValue, request) {
        const actor = this.identity.getSession((0, session_cookie_1.readSessionToken)(cookieHeader));
        const businessProfileId = (0, contact_validation_1.validateBusinessProfileId)(businessProfileIdValue);
        const business = this.requirePublicApprovedBusiness(businessProfileId);
        (0, contact_validation_1.validateTrackContactClick)(request);
        const rateLimit = this.rateLimits.check(`contact-click:${actor?.id ?? 'anonymous'}:${business.id}`);
        if (!rateLimit.allowed) {
            this.audit('contact.click.rate_limited', actor?.id);
            throw new contact_errors_1.ContactRateLimitError();
        }
        const requestContext = (0, request_context_1.getRequestContext)();
        const now = new Date().toISOString();
        const event = {
            id: (0, node_crypto_1.randomUUID)(),
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
    requirePublicApprovedBusiness(businessProfileId) {
        const business = this.contacts.findBusinessProfileSnapshot(businessProfileId);
        if (!business || business.visibility !== 'public' || business.trustStatus !== 'approved') {
            throw new contact_errors_1.ContactBusinessUnavailableError();
        }
        return business;
    }
    toPublicInquiryReceipt(inquiry) {
        return {
            id: inquiry.id,
            businessProfileId: inquiry.businessProfileId,
            status: inquiry.status,
            createdAt: inquiry.createdAt
        };
    }
    audit(eventType, actorUserId) {
        const requestContext = (0, request_context_1.getRequestContext)();
        this.identityRepository.appendAuditLog(eventType, {
            actorUserId,
            requestId: requestContext?.requestId,
            correlationId: requestContext?.correlationId
        });
    }
    logContactEvent(event, businessProfileId) {
        this.logger.log({
            timestamp: new Date().toISOString(),
            event,
            businessProfileId
        });
    }
};
exports.ContactService = ContactService;
exports.ContactService = ContactService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [contact_repository_1.ContactRepository,
        identity_service_1.IdentityService,
        identity_repository_1.IdentityRepository,
        contact_rate_limit_service_1.ContactRateLimitService,
        contact_abuse_service_1.ContactAbuseService,
        platform_logger_1.PlatformLogger])
], ContactService);
//# sourceMappingURL=contact.service.js.map