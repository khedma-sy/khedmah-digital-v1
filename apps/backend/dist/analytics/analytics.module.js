"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsModule = void 0;
const common_1 = require("@nestjs/common");
const identity_module_1 = require("../identity/identity.module");
const platform_logger_1 = require("../logging/platform-logger");
const analytics_controller_1 = require("./analytics.controller");
const analytics_repository_1 = require("./analytics.repository");
const analytics_service_1 = require("./analytics.service");
let AnalyticsModule = class AnalyticsModule {
};
exports.AnalyticsModule = AnalyticsModule;
exports.AnalyticsModule = AnalyticsModule = __decorate([
    (0, common_1.Module)({
        imports: [identity_module_1.IdentityModule],
        controllers: [analytics_controller_1.AnalyticsController],
        providers: [analytics_repository_1.AnalyticsRepository, analytics_service_1.AnalyticsService, platform_logger_1.PlatformLogger],
        exports: [analytics_repository_1.AnalyticsRepository, analytics_service_1.AnalyticsService]
    })
], AnalyticsModule);
//# sourceMappingURL=analytics.module.js.map