"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBusinessProfileId = validateBusinessProfileId;
exports.validateSubmitContactInquiry = validateSubmitContactInquiry;
exports.validateTrackContactClick = validateTrackContactClick;
const contact_errors_1 = require("./contact.errors");
const MAX_BUSINESS_PROFILE_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_SOURCE_LENGTH = 80;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateTrimmedString(value, minLength, maxLength) {
    if (typeof value !== 'string') {
        throw new contact_errors_1.ContactValidationError();
    }
    const trimmed = value.trim();
    if (trimmed.length < minLength || trimmed.length > maxLength) {
        throw new contact_errors_1.ContactValidationError();
    }
    return trimmed;
}
function validateBusinessProfileId(value) {
    return validateTrimmedString(value, 1, MAX_BUSINESS_PROFILE_ID_LENGTH);
}
function validateSubmitContactInquiry(request) {
    const name = validateTrimmedString(request.name, 2, MAX_NAME_LENGTH);
    const contactEmail = validateTrimmedString(request.contactEmail, 3, MAX_EMAIL_LENGTH).toLowerCase();
    const message = validateTrimmedString(request.message, 10, MAX_MESSAGE_LENGTH);
    if (!EMAIL_PATTERN.test(contactEmail)) {
        throw new contact_errors_1.ContactValidationError();
    }
    return { name, contactEmail, message };
}
function validateTrackContactClick(request) {
    return {
        source: request.source === undefined ? undefined : validateTrimmedString(request.source, 1, MAX_SOURCE_LENGTH)
    };
}
//# sourceMappingURL=contact.validation.js.map