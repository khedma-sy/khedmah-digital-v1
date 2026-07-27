"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdentityRepository = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
let IdentityRepository = class IdentityRepository {
    accounts = new Map();
    profiles = new Map();
    sessions = new Map();
    auditLogs = [];
    findAccountByEmail(email) {
        return [...this.accounts.values()].find((account) => account.email === email);
    }
    findAccountById(id) {
        return this.accounts.get(id);
    }
    saveAccount(account) {
        this.accounts.set(account.id, account);
    }
    findProfile(userId) {
        return this.profiles.get(userId);
    }
    saveProfile(profile) {
        this.profiles.set(profile.userId, profile);
    }
    saveSession(session) {
        this.sessions.set(session.id, session);
    }
    findActiveSessionByTokenHash(tokenHash, nowIso = new Date().toISOString()) {
        return [...this.sessions.values()].find((session) => session.tokenHash === tokenHash && !session.revokedAt && session.expiresAt > nowIso);
    }
    revokeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.revokedAt = new Date().toISOString();
        }
    }
    appendAuditLog(eventType, context = {}) {
        this.auditLogs.push({
            id: (0, node_crypto_1.randomUUID)(),
            eventType,
            occurredAt: new Date().toISOString(),
            ...context
        });
    }
    listAuditLogs() {
        return this.auditLogs;
    }
};
exports.IdentityRepository = IdentityRepository;
exports.IdentityRepository = IdentityRepository = __decorate([
    (0, common_1.Injectable)()
], IdentityRepository);
//# sourceMappingURL=identity.repository.js.map