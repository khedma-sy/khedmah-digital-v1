"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafeAuthenticationError = exports.IdentityValidationError = void 0;
const common_1 = require("@nestjs/common");
class IdentityValidationError extends common_1.BadRequestException {
    constructor(message = 'Identity request validation failed.') {
        super(message);
    }
}
exports.IdentityValidationError = IdentityValidationError;
class SafeAuthenticationError extends common_1.UnauthorizedException {
    constructor() {
        super('Invalid credentials.');
    }
}
exports.SafeAuthenticationError = SafeAuthenticationError;
//# sourceMappingURL=identity.errors.js.map