"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrganizationNotFoundError = exports.OrganizationAccessError = exports.OrganizationValidationError = void 0;
const common_1 = require("@nestjs/common");
class OrganizationValidationError extends common_1.BadRequestException {
    constructor() {
        super('Organization request validation failed.');
    }
}
exports.OrganizationValidationError = OrganizationValidationError;
class OrganizationAccessError extends common_1.ForbiddenException {
    constructor() {
        super('Organization access denied.');
    }
}
exports.OrganizationAccessError = OrganizationAccessError;
class OrganizationNotFoundError extends common_1.NotFoundException {
    constructor() {
        super('Organization was not found.');
    }
}
exports.OrganizationNotFoundError = OrganizationNotFoundError;
//# sourceMappingURL=organization.errors.js.map