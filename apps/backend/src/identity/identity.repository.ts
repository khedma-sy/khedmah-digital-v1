import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuditLog, AuditEventType, UserAccount, UserProfile, UserSession } from './identity.types';

@Injectable()
export class IdentityRepository {
  private readonly accounts = new Map<string, UserAccount>();
  private readonly profiles = new Map<string, UserProfile>();
  private readonly sessions = new Map<string, UserSession>();
  private readonly auditLogs: AuditLog[] = [];

  findAccountByEmail(email: string): UserAccount | undefined {
    return [...this.accounts.values()].find((account) => account.email === email);
  }

  findAccountById(id: string): UserAccount | undefined {
    return this.accounts.get(id);
  }

  saveAccount(account: UserAccount): void {
    this.accounts.set(account.id, account);
  }

  findProfile(userId: string): UserProfile | undefined {
    return this.profiles.get(userId);
  }

  saveProfile(profile: UserProfile): void {
    this.profiles.set(profile.userId, profile);
  }

  saveSession(session: UserSession): void {
    this.sessions.set(session.id, session);
  }

  findActiveSessionByTokenHash(tokenHash: string, nowIso = new Date().toISOString()): UserSession | undefined {
    return [...this.sessions.values()].find(
      (session) => session.tokenHash === tokenHash && !session.revokedAt && session.expiresAt > nowIso
    );
  }

  revokeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.revokedAt = new Date().toISOString();
    }
  }

  appendAuditLog(eventType: AuditEventType, context: Omit<AuditLog, 'id' | 'eventType' | 'occurredAt'> = {}): void {
    this.auditLogs.push({
      id: randomUUID(),
      eventType,
      occurredAt: new Date().toISOString(),
      ...context
    });
  }

  listAuditLogs(): readonly AuditLog[] {
    return this.auditLogs;
  }
}
