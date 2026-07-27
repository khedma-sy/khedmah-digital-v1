import { AuditLog, AuditEventType, UserAccount, UserProfile, UserSession } from './identity.types';
export declare class IdentityRepository {
    private readonly accounts;
    private readonly profiles;
    private readonly sessions;
    private readonly auditLogs;
    findAccountByEmail(email: string): UserAccount | undefined;
    findAccountById(id: string): UserAccount | undefined;
    saveAccount(account: UserAccount): void;
    findProfile(userId: string): UserProfile | undefined;
    saveProfile(profile: UserProfile): void;
    saveSession(session: UserSession): void;
    findActiveSessionByTokenHash(tokenHash: string, nowIso?: string): UserSession | undefined;
    revokeSession(sessionId: string): void;
    appendAuditLog(eventType: AuditEventType, context?: Omit<AuditLog, 'id' | 'eventType' | 'occurredAt'>): void;
    listAuditLogs(): readonly AuditLog[];
}
