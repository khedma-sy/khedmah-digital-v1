"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdentityModule = void 0;
const common_1 = require("@nestjs/common");
const auth_controller_1 = require("./auth.controller");
const identity_repository_1 = require("./identity.repository");
const identity_service_1 = require("./identity.service");
const session_token_service_1 = require("./security/session-token.service");
const users_controller_1 = require("./users.controller");
let IdentityModule = class IdentityModule {
};
exports.IdentityModule = IdentityModule;
exports.IdentityModule = IdentityModule = __decorate([
    (0, common_1.Module)({
        controllers: [auth_controller_1.AuthController, users_controller_1.UsersController],
        providers: [identity_repository_1.IdentityRepository, identity_service_1.IdentityService, session_token_service_1.SessionTokenService],
        exports: [identity_service_1.IdentityService, identity_repository_1.IdentityRepository]
    })
], IdentityModule);
//# sourceMappingURL=identity.module.js.map