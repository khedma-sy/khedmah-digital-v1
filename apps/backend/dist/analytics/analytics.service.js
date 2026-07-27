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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const request_context_1 = require("../context/request-context");
const identity_repository_1 = require("../identity/identity.repository");
const platform_logger_1 = require("../logging/platform-logger");
const analytics_repository_1 = require("./analytics.repository");
const analytics_validation_1 = require("./analytics.validation");
let AnalyticsService = class AnalyticsService {
    analytics;
    identityRepository;
    logger;
    constructor(analytics, identityRepository, logger) {
        this.analytics = analytics;
        this.identityRepository = identityRepository;
        this.logger = logger;
    }
    recordEvent(request) {
        const input = (0, analytics_validation_1.validateRecordAnalyticsEvent)(request);
        const requestContext = (0, request_context_1.getRequestContext)();
        const event = {
            id: (0, node_crypto_1.randomUUID)(),
            ...input,
            createdAt: new Date().toISOString(),
            requestId: requestContext?.requestId,
            correlationId: requestContext?.correlationId
        };
        this.analytics.saveEvent(event);
        this.auditRecordedEvent();
        this.logRecordedEvent(event);
        return {
            id: event.id,
            eventType: event.eventType,
            entityType: event.entityType,
            entityId: event.entityId,
            recordedAt: event.createdAt
        };
    }
    auditRecordedEvent() {
        const requestContext = (0, request_context_1.getRequestContext)();
        this.identityRepository.appendAuditLog('analytics.event.recorded', {
            requestId: requestContext?.requestId,
            correlationId: requestContext?.correlationId
        });
    }
    logRecordedEvent(event) {
        this.logger.log({
            timestamp: new Date().toISOString(),
            event: 'analytics_event_recorded',
            eventType: event.eventType,
            entityType: event.entityType
        });
    }
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(analytics_repository_1.AnalyticsRepository)),
    __param(1, (0, common_1.Inject)(identity_repository_1.IdentityRepository)),
    __param(2, (0, common_1.Inject)(platform_logger_1.PlatformLogger)),
    __metadata("design:paramtypes", [analytics_repository_1.AnalyticsRepository,
        identity_repository_1.IdentityRepository,
        platform_logger_1.PlatformLogger])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map