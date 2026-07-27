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
exports.PlatformLogger = void 0;
const common_1 = require("@nestjs/common");
const platform_config_1 = require("../config/platform-config");
let PlatformLogger = class PlatformLogger extends common_1.ConsoleLogger {
    serviceName = (0, platform_config_1.loadPlatformConfig)().serviceName;
    constructor() {
        super('KhedmahDigitalV1', {
            timestamp: true,
            logLevels: ['log', 'error', 'warn', 'debug']
        });
    }
    logRequestLifecycle(context) {
        this.log({
            timestamp: new Date().toISOString(),
            level: 'log',
            serviceName: this.serviceName,
            event: 'request_completed',
            requestId: context.requestId,
            correlationId: context.correlationId,
            method: context.method,
            path: context.path,
            statusCode: context.statusCode,
            durationMs: context.durationMs
        });
    }
    logErrorContext(context) {
        this.error({
            timestamp: new Date().toISOString(),
            level: 'error',
            serviceName: this.serviceName,
            event: 'request_failed',
            requestId: context.requestId,
            correlationId: context.correlationId,
            statusCode: context.statusCode,
            code: context.code
        });
    }
};
exports.PlatformLogger = PlatformLogger;
exports.PlatformLogger = PlatformLogger = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], PlatformLogger);
//# sourceMappingURL=platform-logger.js.map