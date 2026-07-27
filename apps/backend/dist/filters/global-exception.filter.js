"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
const request_context_1 = require("../context/request-context");
const platform_logger_1 = require("../logging/platform-logger");
function errorCodeForStatus(status) {
    if (status === common_1.HttpStatus.BAD_REQUEST) {
        return 'validation_error';
    }
    if (status === common_1.HttpStatus.NOT_FOUND) {
        return 'not_found';
    }
    if (status >= 500) {
        return 'internal_error';
    }
    return 'request_error';
}
function safeMessageForStatus(status) {
    if (status === common_1.HttpStatus.BAD_REQUEST) {
        return 'Request validation failed.';
    }
    if (status === common_1.HttpStatus.NOT_FOUND) {
        return 'Resource was not found.';
    }
    if (status >= 500) {
        return 'Unexpected platform error.';
    }
    return 'Request could not be completed.';
}
let GlobalExceptionFilter = class GlobalExceptionFilter {
    logger;
    constructor(logger = new platform_logger_1.PlatformLogger()) {
        this.logger = logger;
    }
    catch(exception, host) {
        const context = host.switchToHttp();
        const response = context.getResponse();
        const status = exception instanceof common_1.HttpException ? exception.getStatus() : common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        const requestContext = (0, request_context_1.getRequestContext)();
        const code = errorCodeForStatus(status);
        this.logger.logErrorContext({
            requestId: requestContext?.requestId,
            correlationId: requestContext?.correlationId,
            statusCode: status,
            code
        });
        const body = {
            error: {
                code,
                message: safeMessageForStatus(status),
                timestamp: new Date().toISOString(),
                requestId: requestContext?.requestId,
                correlationId: requestContext?.correlationId
            }
        };
        response.status(status).json(body);
    }
};
exports.GlobalExceptionFilter = GlobalExceptionFilter;
exports.GlobalExceptionFilter = GlobalExceptionFilter = __decorate([
    (0, common_1.Catch)(),
    __metadata("design:paramtypes", [Object])
], GlobalExceptionFilter);
//# sourceMappingURL=global-exception.filter.js.map