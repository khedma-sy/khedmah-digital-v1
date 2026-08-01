import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { ContactActionEvent, ContactInquiry } from './contact.types';

@Injectable()
export class ContactRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async saveContactInquiry(inquiry: ContactInquiry): Promise<void> {
    await this.db.query(
      `INSERT INTO contact_inquiries
         (id, business_profile_id, submitter_user_id, name, contact_email,
          message, status, request_id, correlation_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO NOTHING`,
      [
        inquiry.id, inquiry.businessProfileId, inquiry.submitterUserId,
        inquiry.name, inquiry.contactEmail, inquiry.message, inquiry.status,
        inquiry.requestId ?? null, inquiry.correlationId ?? null, inquiry.createdAt
      ]
    );
  }

  async findContactInquiry(id: string): Promise<ContactInquiry | undefined> {
    const rows = await this.db.query<{
      id: string; business_profile_id: string; submitter_user_id: string;
      name: string; contact_email: string; message: string; status: string;
      request_id: string | null; correlation_id: string | null; created_at: Date;
    }>(
      `SELECT id,business_profile_id,submitter_user_id,name,contact_email,
              message,status,request_id,correlation_id,created_at
       FROM contact_inquiries WHERE id=$1 LIMIT 1`,
      [id]
    );
    return rows[0] ? this.mapInquiry(rows[0]) : undefined;
  }

  async listContactInquiries(businessProfileId: string): Promise<ContactInquiry[]> {
    const rows = await this.db.query<{
      id: string; business_profile_id: string; submitter_user_id: string;
      name: string; contact_email: string; message: string; status: string;
      request_id: string | null; correlation_id: string | null; created_at: Date;
    }>(
      `SELECT id,business_profile_id,submitter_user_id,name,contact_email,
              message,status,request_id,correlation_id,created_at
       FROM contact_inquiries WHERE business_profile_id=$1 ORDER BY created_at DESC`,
      [businessProfileId]
    );
    return rows.map((r) => this.mapInquiry(r));
  }

  async saveContactAction(event: ContactActionEvent): Promise<void> {
    await this.db.query(
      `INSERT INTO contact_actions
         (id, business_profile_id, actor_user_id, action_type, request_id, correlation_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        event.id, event.businessProfileId, event.actorUserId ?? null,
        event.actionType, event.requestId ?? null, event.correlationId ?? null, event.createdAt
      ]
    );
  }

  async findBusinessProfileSnapshot(id: string): Promise<{ id: string; visibility: string; trustStatus: string; ownerUserId: string } | undefined> {
    const rows = await this.db.query<{
      id: string; visibility: string; trust_status: string; owner_user_id: string;
    }>(
      `SELECT id, visibility, trust_status, owner_user_id FROM business_profiles WHERE id=$1 LIMIT 1`,
      [id]
    );
    if (!rows[0]) return undefined;
    return {
      id: rows[0].id,
      visibility: rows[0].visibility,
      trustStatus: rows[0].trust_status,
      ownerUserId: rows[0].owner_user_id
    };
  }

  private mapInquiry(r: {
    id: string; business_profile_id: string; submitter_user_id: string;
    name: string; contact_email: string; message: string; status: string;
    request_id: string | null; correlation_id: string | null; created_at: Date;
  }): ContactInquiry {
    return {
      id: r.id,
      businessProfileId: r.business_profile_id,
      submitterUserId: r.submitter_user_id,
      name: r.name,
      contactEmail: r.contact_email,
      message: r.message,
      status: r.status as ContactInquiry['status'],
      requestId: r.request_id ?? undefined,
      correlationId: r.correlation_id ?? undefined,
      createdAt: r.created_at.toISOString()
    };
  }
}
