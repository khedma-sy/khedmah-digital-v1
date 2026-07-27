import { ContactActionEvent, ContactBusinessProfileSnapshot, ContactInquiry } from './contact.types';
export declare class ContactRepository {
    private readonly businessProfiles;
    private readonly contactInquiries;
    private readonly contactActions;
    saveBusinessProfileSnapshot(profile: ContactBusinessProfileSnapshot): void;
    findBusinessProfileSnapshot(id: string): ContactBusinessProfileSnapshot | undefined;
    saveContactInquiry(inquiry: ContactInquiry): void;
    findContactInquiry(id: string): ContactInquiry | undefined;
    listContactInquiries(): ContactInquiry[];
    saveContactAction(event: ContactActionEvent): void;
    listContactActions(): ContactActionEvent[];
}
