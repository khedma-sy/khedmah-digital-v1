import { ContactService } from './contact.service';
import { SubmitContactInquiryRequest, TrackContactClickRequest } from './dto/contact.dto';
export declare class ContactController {
    private readonly contactService;
    constructor(contactService: ContactService);
    submitInquiry(cookieHeader: string | undefined, businessProfileId: string, body: SubmitContactInquiryRequest): {
        inquiry: import("./contact.types").PublicContactInquiryReceipt;
    };
    trackContactClick(cookieHeader: string | undefined, businessProfileId: string, body: TrackContactClickRequest): {
        contactAction: import("./contact.types").PublicContactActionReceipt;
    };
}
