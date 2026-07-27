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
exports.OrganizationsController = void 0;
const common_1 = require("@nestjs/common");
const organization_service_1 = require("./organization.service");
let OrganizationsController = class OrganizationsController {
    organizationService;
    constructor(organizationService) {
        this.organizationService = organizationService;
    }
    create(cookieHeader, body) {
        return { organization: this.organizationService.create(cookieHeader, body) };
    }
    mine(cookieHeader) {
        return { organizations: this.organizationService.listMine(cookieHeader) };
    }
    details(cookieHeader, id) {
        return { organization: this.organizationService.getDetails(cookieHeader, id) };
    }
    update(cookieHeader, id, body) {
        return { organization: this.organizationService.update(cookieHeader, id, body) };
    }
    members(cookieHeader, id) {
        return { members: this.organizationService.listMembers(cookieHeader, id) };
    }
    addMember(cookieHeader, id, body) {
        return { member: this.organizationService.addMember(cookieHeader, id, body) };
    }
    updateMember(cookieHeader, id, memberId, body) {
        return { member: this.organizationService.updateMember(cookieHeader, id, memberId, body) };
    }
    removeMember(cookieHeader, id, memberId) {
        return this.organizationService.removeMember(cookieHeader, id, memberId);
    }
};
exports.OrganizationsController = OrganizationsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Headers)('cookie')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('my'),
    __param(0, (0, common_1.Headers)('cookie')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "mine", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Headers)('cookie')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "details", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Headers)('cookie')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "update", null);
__decorate([
    (0, common_1.Get)(':id/members'),
    __param(0, (0, common_1.Headers)('cookie')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "members", null);
__decorate([
    (0, common_1.Post)(':id/members'),
    __param(0, (0, common_1.Headers)('cookie')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "addMember", null);
__decorate([
    (0, common_1.Patch)(':id/members/:memberId'),
    __param(0, (0, common_1.Headers)('cookie')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('memberId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "updateMember", null);
__decorate([
    (0, common_1.Delete)(':id/members/:memberId'),
    __param(0, (0, common_1.Headers)('cookie')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('memberId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "removeMember", null);
exports.OrganizationsController = OrganizationsController = __decorate([
    (0, common_1.Controller)('organizations'),
    __metadata("design:paramtypes", [organization_service_1.OrganizationService])
], OrganizationsController);
//# sourceMappingURL=organizations.controller.js.map