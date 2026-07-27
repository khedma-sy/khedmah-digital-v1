import { SubmitContactInquiryRequest, TrackContactClickRequest } from './dto/contact.dto';
export declare function validateBusinessProfileId(value: unknown): string;
export declare function validateSubmitContactInquiry(request: SubmitContactInquiryRequest): {
    name: string;
    contactEmail: string;
    message: string;
};
export declare function validateTrackContactClick(request: TrackContactClickRequest): {
    source: string | undefined;
};
