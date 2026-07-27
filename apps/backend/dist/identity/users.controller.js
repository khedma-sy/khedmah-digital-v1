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
exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const identity_service_1 = require("./identity.service");
const session_cookie_1 = require("./session-cookie");
let UsersController = class UsersController {
    identityService;
    constructor(identityService) {
        this.identityService = identityService;
    }
    me(cookieHeader) {
        return { user: this.identityService.getCurrentUser((0, session_cookie_1.readSessionToken)(cookieHeader)) };
    }
    updateProfile(cookieHeader, body) {
        return { user: this.identityService.updateProfile((0, session_cookie_1.readSessionToken)(cookieHeader), body) };
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Get)('me'),
    __param(0, (0, common_1.Headers)('cookie')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], UsersController.prototype, "me", null);
__decorate([
    (0, common_1.Patch)('me/profile'),
    __param(0, (0, common_1.Headers)('cookie')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Object)
], UsersController.prototype, "updateProfile", null);
exports.UsersController = UsersController = __decorate([
    (0, common_1.Controller)('users'),
    __metadata("design:paramtypes", [identity_service_1.IdentityService])
], UsersController);
//# sourceMappingURL=users.controller.js.map