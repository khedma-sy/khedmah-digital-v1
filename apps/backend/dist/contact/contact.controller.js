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
exports.ContactController = void 0;
const common_1 = require("@nestjs/common");
const contact_service_1 = require("./contact.service");
let ContactController = class ContactController {
    contactService;
    constructor(contactService) {
        this.contactService = contactService;
    }
    submitInquiry(cookieHeader, businessProfileId, body) {
        return { inquiry: this.contactService.submitInquiry(cookieHeader, businessProfileId, body) };
    }
    trackContactClick(cookieHeader, businessProfileId, body) {
        return { contactAction: this.contactService.trackContactClick(cookieHeader, businessProfileId, body) };
    }
};
exports.ContactController = ContactController;
__decorate([
    (0, common_1.Post)('inquiries'),
    __param(0, (0, common_1.Headers)('cookie')),
    __param(1, (0, common_1.Param)('businessProfileId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], ContactController.prototype, "submitInquiry", null);
__decorate([
    (0, common_1.Post)('contact-click'),
    __param(0, (0, common_1.Headers)('cookie')),
    __param(1, (0, common_1.Param)('businessProfileId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], ContactController.prototype, "trackContactClick", null);
exports.ContactController = ContactController = __decorate([
    (0, common_1.Controller)('businesses/:businessProfileId'),
    __metadata("design:paramtypes", [contact_service_1.ContactService])
], ContactController);
//# sourceMappingURL=contact.controller.js.map