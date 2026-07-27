import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { PlatformLogger } from '../logging/platform-logger';
import { ContactAbuseService } from './contact-abuse.service';
import { ContactRateLimitService } from './contact-rate-limit.service';
import { ContactRepository } from './contact.repository';
import { PublicContactActionReceipt, PublicContactInquiryReceipt } from './contact.types';
import { SubmitContactInquiryRequest, TrackContactClickRequest } from './dto/contact.dto';
export declare class ContactService {
    private readonly contacts;
    private readonly identity;
    private readonly identityRepository;
    private readonly rateLimits;
    private readonly abuse;
    private readonly logger;
    constructor(contacts: ContactRepository, identity: IdentityService, identityRepository: IdentityRepository, rateLimits: ContactRateLimitService, abuse: ContactAbuseService, logger: PlatformLogger);
    submitInquiry(cookieHeader: string | undefined, businessProfileIdValue: string, request: SubmitContactInquiryRequest): PublicContactInquiryReceipt;
    trackContactClick(cookieHeader: string | undefined, businessProfileIdValue: string, request: TrackContactClickRequest): PublicContactActionReceipt;
    private requirePublicApprovedBusiness;
    private toPublicInquiryReceipt;
    private audit;
    private logContactEvent;
}
