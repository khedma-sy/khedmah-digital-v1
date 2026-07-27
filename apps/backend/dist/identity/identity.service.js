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
exports.IdentityService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const request_context_1 = require("../context/request-context");
const identity_repository_1 = require("./identity.repository");
const identity_errors_1 = require("./identity.errors");
const password_security_1 = require("./security/password-security");
const session_token_service_1 = require("./security/session-token.service");
const identity_validation_1 = require("./identity.validation");
let IdentityService = class IdentityService {
    repository;
    sessionTokens;
    constructor(repository, sessionTokens) {
        this.repository = repository;
        this.sessionTokens = sessionTokens;
    }
    register(request) {
        const input = (0, identity_validation_1.validateRegisterRequest)(request);
        if (this.repository.findAccountByEmail(input.email)) {
            throw new common_1.ConflictException('Account already exists.');
        }
        const now = new Date().toISOString();
        const userId = (0, node_crypto_1.randomUUID)();
        const account = {
            id: userId,
            email: input.email,
            passwordHash: (0, password_security_1.hashPassword)(input.password),
            status: 'active',
            createdAt: now,
            updatedAt: now
        };
        const profile = {
            userId,
            displayName: input.displayName,
            locale: 'ar',
            createdAt: now,
            updatedAt: now
        };
        this.repository.saveAccount(account);
        this.repository.saveProfile(profile);
        this.audit('auth.register', userId);
        return this.createSession(account, profile);
    }
    login(request) {
        const input = (0, identity_validation_1.validateLoginRequest)(request);
        const account = this.repository.findAccountByEmail(input.email);
        if (!account || account.status !== 'active' || !(0, password_security_1.verifyPassword)(input.password, account.passwordHash)) {
            this.audit('auth.login_failed');
            throw new identity_errors_1.SafeAuthenticationError();
        }
        const profile = this.repository.findProfile(account.id);
        if (!profile) {
            throw new common_1.UnauthorizedException('Session could not be established.');
        }
        this.audit('auth.login_success', account.id);
        return this.createSession(account, profile);
    }
    logout(sessionToken) {
        const session = this.findSession(sessionToken);
        if (session) {
            this.repository.revokeSession(session.id);
            this.audit('auth.logout', session.userId);
        }
    }
    getSession(sessionToken) {
        const session = this.findSession(sessionToken);
        if (!session) {
            return undefined;
        }
        const account = this.repository.findAccountById(session.userId);
        const profile = this.repository.findProfile(session.userId);
        if (!account || !profile || account.status !== 'active') {
            return undefined;
        }
        return this.toPublicProfile(account, profile);
    }
    getCurrentUser(sessionToken) {
        const user = this.getSession(sessionToken);
        if (!user) {
            throw new common_1.UnauthorizedException('Authentication required.');
        }
        return user;
    }
    updateProfile(sessionToken, request) {
        const currentUser = this.getCurrentUser(sessionToken);
        const input = (0, identity_validation_1.validateUpdateProfileRequest)(request);
        const account = this.repository.findAccountById(currentUser.id);
        const existingProfile = this.repository.findProfile(currentUser.id);
        if (!account || !existingProfile) {
            throw new common_1.UnauthorizedException('Authentication required.');
        }
        const now = new Date().toISOString();
        const profile = {
            ...existingProfile,
            displayName: input.displayName,
            updatedAt: now
        };
        this.repository.saveProfile(profile);
        this.audit('profile.update', account.id);
        return this.toPublicProfile(account, profile);
    }
    createSession(account, profile) {
        const sessionToken = this.sessionTokens.createToken();
        this.repository.saveSession({
            id: (0, node_crypto_1.randomUUID)(),
            userId: account.id,
            tokenHash: this.sessionTokens.hashToken(sessionToken),
            expiresAt: this.sessionTokens.expiresAt(),
            createdAt: new Date().toISOString()
        });
        return {
            sessionToken,
            user: this.toPublicProfile(account, profile)
        };
    }
    findSession(sessionToken) {
        if (!sessionToken) {
            return undefined;
        }
        return this.repository.findActiveSessionByTokenHash(this.sessionTokens.hashToken(sessionToken));
    }
    toPublicProfile(account, profile) {
        return {
            id: account.id,
            email: account.email,
            status: account.status,
            profile: {
                displayName: profile.displayName,
                locale: profile.locale
            }
        };
    }
    audit(eventType, actorUserId) {
        const requestContext = (0, request_context_1.getRequestContext)();
        this.repository.appendAuditLog(eventType, {
            actorUserId,
            requestId: requestContext?.requestId,
            correlationId: requestContext?.correlationId
        });
    }
};
exports.IdentityService = IdentityService;
exports.IdentityService = IdentityService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(identity_repository_1.IdentityRepository)),
    __param(1, (0, common_1.Inject)(session_token_service_1.SessionTokenService)),
    __metadata("design:paramtypes", [identity_repository_1.IdentityRepository,
        session_token_service_1.SessionTokenService])
], IdentityService);
//# sourceMappingURL=identity.service.js.map