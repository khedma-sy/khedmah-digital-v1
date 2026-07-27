"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeEmail = normalizeEmail;
exports.validatePassword = validatePassword;
exports.validateDisplayName = validateDisplayName;
exports.validateRegisterRequest = validateRegisterRequest;
exports.validateLoginRequest = validateLoginRequest;
exports.validateUpdateProfileRequest = validateUpdateProfileRequest;
const identity_errors_1 = require("./identity.errors");
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normalizeEmail(value) {
    if (typeof value !== 'string') {
        throw new identity_errors_1.IdentityValidationError();
    }
    const email = value.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
        throw new identity_errors_1.IdentityValidationError();
    }
    return email;
}
function validatePassword(value) {
    if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
        throw new identity_errors_1.IdentityValidationError();
    }
    return value;
}
function validateDisplayName(value) {
    if (typeof value !== 'string') {
        throw new identity_errors_1.IdentityValidationError();
    }
    const displayName = value.trim();
    if (displayName.length < 2 || displayName.length > 80) {
        throw new identity_errors_1.IdentityValidationError();
    }
    return displayName;
}
function validateRegisterRequest(request) {
    return {
        email: normalizeEmail(request.email),
        password: validatePassword(request.password),
        displayName: validateDisplayName(request.displayName)
    };
}
function validateLoginRequest(request) {
    return {
        email: normalizeEmail(request.email),
        password: validatePassword(request.password)
    };
}
function validateUpdateProfileRequest(request) {
    return {
        displayName: validateDisplayName(request.displayName)
    };
}
//# sourceMappingURL=identity.validation.js.map