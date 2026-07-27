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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const identity_service_1 = require("./identity.service");
const session_cookie_1 = require("./session-cookie");
let AuthController = class AuthController {
    identityService;
    constructor(identityService) {
        this.identityService = identityService;
    }
    register(body, response) {
        const result = this.identityService.register(body);
        (0, session_cookie_1.attachSessionCookie)(response, result.sessionToken);
        return { user: result.user };
    }
    login(body, response) {
        const result = this.identityService.login(body);
        (0, session_cookie_1.attachSessionCookie)(response, result.sessionToken);
        return { user: result.user };
    }
    logout(cookieHeader, response) {
        this.identityService.logout((0, session_cookie_1.readSessionToken)(cookieHeader));
        (0, session_cookie_1.clearSessionCookie)(response);
        return { status: 'ok' };
    }
    session(cookieHeader) {
        const user = this.identityService.getSession((0, session_cookie_1.readSessionToken)(cookieHeader));
        if (!user) {
            throw new common_1.UnauthorizedException('Authentication required.');
        }
        return { user };
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('register'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Object)
], AuthController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('login'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Object)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('logout'),
    __param(0, (0, common_1.Headers)('cookie')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Get)('session'),
    __param(0, (0, common_1.Headers)('cookie')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], AuthController.prototype, "session", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [identity_service_1.IdentityService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map