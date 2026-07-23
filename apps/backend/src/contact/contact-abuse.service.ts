import { Injectable } from '@nestjs/common';

@Injectable()
export class ContactAbuseService {
  shouldBlockInquiry(input: { readonly message: string; readonly contactEmail: string }): boolean {
    const normalizedMessage = input.message.toLowerCase();
    const normalizedEmail = input.contactEmail.toLowerCase();

    return normalizedMessage.includes('http://') || normalizedMessage.includes('https://') || normalizedEmail.includes('noreply@');
  }
}
