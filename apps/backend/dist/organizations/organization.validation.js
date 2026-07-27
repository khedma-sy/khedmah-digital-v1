"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCreateOrganization = validateCreateOrganization;
exports.validateUpdateOrganization = validateUpdateOrganization;
exports.validateAddMember = validateAddMember;
exports.validateUpdateMember = validateUpdateMember;
const organization_errors_1 = require("./organization.errors");
function validateName(value) {
    if (typeof value !== 'string') {
        throw new organization_errors_1.OrganizationValidationError();
    }
    const name = value.trim();
    if (name.length < 2 || name.length > 120) {
        throw new organization_errors_1.OrganizationValidationError();
    }
    return name;
}
function validateIdentifier(value) {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > 128) {
        throw new organization_errors_1.OrganizationValidationError();
    }
    return value.trim();
}
function validateRole(value) {
    if (value === 'owner' || value === 'member') {
        return value;
    }
    throw new organization_errors_1.OrganizationValidationError();
}
function validateStatus(value) {
    if (value === 'active' || value === 'removed') {
        return value;
    }
    throw new organization_errors_1.OrganizationValidationError();
}
function validateCreateOrganization(request) {
    return { name: validateName(request.name) };
}
function validateUpdateOrganization(request) {
    return { name: validateName(request.name) };
}
function validateAddMember(request) {
    return {
        userId: validateIdentifier(request.userId),
        role: request.role === undefined ? 'member' : validateRole(request.role)
    };
}
function validateUpdateMember(request) {
    return {
        role: request.role === undefined ? undefined : validateRole(request.role),
        status: request.status === undefined ? undefined : validateStatus(request.status)
    };
}
//# sourceMappingURL=organization.validation.js.map