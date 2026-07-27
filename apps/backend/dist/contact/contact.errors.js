"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactRateLimitError = exports.ContactAccessError = exports.ContactBusinessUnavailableError = exports.ContactValidationError = void 0;
const common_1 = require("@nestjs/common");
class ContactValidationError extends common_1.BadRequestException {
    constructor() {
        super('Contact request validation failed.');
    }
}
exports.ContactValidationError = ContactValidationError;
class ContactBusinessUnavailableError extends common_1.NotFoundException {
    constructor() {
        super('Business profile is not available for contact.');
    }
}
exports.ContactBusinessUnavailableError = ContactBusinessUnavailableError;
class ContactAccessError extends common_1.ForbiddenException {
    constructor() {
        super('Contact action is not allowed.');
    }
}
exports.ContactAccessError = ContactAccessError;
class ContactRateLimitError extends common_1.HttpException {
    constructor() {
        super('Contact rate limit exceeded.', common_1.HttpStatus.TOO_MANY_REQUESTS);
    }
}
exports.ContactRateLimitError = ContactRateLimitError;
//# sourceMappingURL=contact.errors.js.map