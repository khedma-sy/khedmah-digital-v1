"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactModule = void 0;
const common_1 = require("@nestjs/common");
const identity_module_1 = require("../identity/identity.module");
const platform_logger_1 = require("../logging/platform-logger");
const contact_abuse_service_1 = require("./contact-abuse.service");
const contact_controller_1 = require("./contact.controller");
const contact_rate_limit_service_1 = require("./contact-rate-limit.service");
const contact_repository_1 = require("./contact.repository");
const contact_service_1 = require("./contact.service");
let ContactModule = class ContactModule {
};
exports.ContactModule = ContactModule;
exports.ContactModule = ContactModule = __decorate([
    (0, common_1.Module)({
        imports: [identity_module_1.IdentityModule],
        controllers: [contact_controller_1.ContactController],
        providers: [contact_repository_1.ContactRepository, contact_service_1.ContactService, contact_rate_limit_service_1.ContactRateLimitService, contact_abuse_service_1.ContactAbuseService, platform_logger_1.PlatformLogger],
        exports: [contact_repository_1.ContactRepository, contact_service_1.ContactService, contact_rate_limit_service_1.ContactRateLimitService]
    })
], ContactModule);
//# sourceMappingURL=contact.module.js.map