"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const analytics_module_1 = require("./analytics/analytics.module");
const contact_module_1 = require("./contact/contact.module");
const health_controller_1 = require("./health.controller");
const health_service_1 = require("./health.service");
const identity_module_1 = require("./identity/identity.module");
const platform_logger_1 = require("./logging/platform-logger");
const organizations_module_1 = require("./organizations/organizations.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [identity_module_1.IdentityModule, organizations_module_1.OrganizationsModule, contact_module_1.ContactModule, analytics_module_1.AnalyticsModule],
        controllers: [health_controller_1.HealthController],
        providers: [health_service_1.HealthService, platform_logger_1.PlatformLogger]
    })
], AppModule);
//# sourceMappingURL=app.module.js.map