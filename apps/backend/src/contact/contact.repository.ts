import { Injectable } from '@nestjs/common';
import { ContactActionEvent, ContactBusinessProfileSnapshot, ContactInquiry } from './contact.types';

@Injectable()
export class ContactRepository {
  private readonly businessProfiles = new Map<string, ContactBusinessProfileSnapshot>();
  private readonly contactInquiries = new Map<string, ContactInquiry>();
  private readonly contactActions = new Map<string, ContactActionEvent>();

  saveBusinessProfileSnapshot(profile: ContactBusinessProfileSnapshot): void {
    this.businessProfiles.set(profile.id, profile);
  }

  findBusinessProfileSnapshot(id: string): ContactBusinessProfileSnapshot | undefined {
    return this.businessProfiles.get(id);
  }

  saveContactInquiry(inquiry: ContactInquiry): void {
    this.contactInquiries.set(inquiry.id, inquiry);
  }

  findContactInquiry(id: string): ContactInquiry | undefined {
    return this.contactInquiries.get(id);
  }

  listContactInquiries(): ContactInquiry[] {
    return [...this.contactInquiries.values()];
  }

  saveContactAction(event: ContactActionEvent): void {
    this.contactActions.set(event.id, event);
  }

  listContactActions(): ContactActionEvent[] {
    return [...this.contactActions.values()];
  }
}
