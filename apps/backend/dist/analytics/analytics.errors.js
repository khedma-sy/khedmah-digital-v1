"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsValidationError = void 0;
const common_1 = require("@nestjs/common");
class AnalyticsValidationError extends common_1.BadRequestException {
    constructor() {
        super('Analytics event validation failed.');
    }
}
exports.AnalyticsValidationError = AnalyticsValidationError;
//# sourceMappingURL=analytics.errors.js.map