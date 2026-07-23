import { SubmitContactInquiryRequest, TrackContactClickRequest } from './dto/contact.dto';
import { ContactValidationError } from './contact.errors';

const MAX_BUSINESS_PROFILE_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_SOURCE_LENGTH = 80;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateTrimmedString(value: unknown, minLength: number, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new ContactValidationError();
  }

  const trimmed = value.trim();
  if (trimmed.length < minLength || trimmed.length > maxLength) {
    throw new ContactValidationError();
  }

  return trimmed;
}

export function validateBusinessProfileId(value: unknown): string {
  return validateTrimmedString(value, 1, MAX_BUSINESS_PROFILE_ID_LENGTH);
}

export function validateSubmitContactInquiry(request: SubmitContactInquiryRequest) {
  const name = validateTrimmedString(request.name, 2, MAX_NAME_LENGTH);
  const contactEmail = validateTrimmedString(request.contactEmail, 3, MAX_EMAIL_LENGTH).toLowerCase();
  const message = validateTrimmedString(request.message, 10, MAX_MESSAGE_LENGTH);

  if (!EMAIL_PATTERN.test(contactEmail)) {
    throw new ContactValidationError();
  }

  return { name, contactEmail, message };
}

export function validateTrackContactClick(request: TrackContactClickRequest) {
  return {
    source: request.source === undefined ? undefined : validateTrimmedString(request.source, 1, MAX_SOURCE_LENGTH)
  };
}
