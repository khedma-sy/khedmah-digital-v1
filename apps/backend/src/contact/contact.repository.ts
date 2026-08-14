import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { ContactActionEvent, ContactInquiry } from './contact.types';

interface IdempotentInquiryResult {
  inquiry: ContactInquiry;
  payloadFingerprint: string;
  created: boolean;
}

@Injectable()
export class ContactRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async findIdempotentInquiry(submitterUserId: string, idempotencyKey: string): Promise<IdempotentInquiryResult | undefined> {
    const rows = await this.db.query<InquiryRow & { payload_fingerprint: string }>(
      `${INQUIRY_SELECT}
       JOIN contact_submission_idempotency i ON i.inquiry_id = q.id
       WHERE i.submitter_user_id=$1 AND i.idempotency_key=$2 LIMIT 1`,
      [submitterUserId, idempotencyKey]
    );
    return rows[0] ? { inquiry: this.mapInquiry(rows[0]), payloadFingerprint: rows[0].payload_fingerprint, created: false } : undefined;
  }

  async createIdempotentInquiry(inquiry: ContactInquiry, idempotencyKey: string, payloadFingerprint: string): Promise<IdempotentInquiryResult> {
    try {
      await this.db.transaction(async (client) => {
        await client.query(
          `INSERT INTO contact_inquiries
             (id, business_profile_id, professional_profile_id, submitter_user_id, name, contact_email,
              message, status, tracking_status, request_id, correlation_id, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [inquiry.id, inquiry.businessProfileId ?? null, inquiry.professionalProfileId ?? null,
            inquiry.submitterUserId, inquiry.name, inquiry.contactEmail, inquiry.message, inquiry.status, inquiry.trackingStatus,
            inquiry.requestId ?? null, inquiry.correlationId ?? null, inquiry.createdAt]
        );
        await client.query(
          `INSERT INTO contact_submission_idempotency
             (submitter_user_id, idempotency_key, inquiry_id, payload_fingerprint, created_at)
           VALUES ($1,$2,$3,$4,$5)`,
          [inquiry.submitterUserId, idempotencyKey, inquiry.id, payloadFingerprint, inquiry.createdAt]
        );
      });
      return { inquiry, payloadFingerprint, created: true };
    } catch (error) {
      if (!isIdempotencyUniqueViolation(error)) throw error;
      const existing = await this.findIdempotentInquiry(inquiry.submitterUserId, idempotencyKey);
      if (!existing) throw error;
      return existing;
    }
  }

  async findContactInquiry(id: string): Promise<ContactInquiry | undefined> {
    const rows = await this.db.query<{
      id: string; business_profile_id: string | null; professional_profile_id: string | null; submitter_user_id: string;
      name: string; contact_email: string; message: string; status: string; tracking_status: string;
      request_id: string | null; correlation_id: string | null; created_at: Date;
    }>(
      `SELECT id,business_profile_id,professional_profile_id,submitter_user_id,name,contact_email,
              message,status,tracking_status,request_id,correlation_id,created_at
       FROM contact_inquiries WHERE id=$1 LIMIT 1`,
      [id]
    );
    return rows[0] ? this.mapInquiry(rows[0]) : undefined;
  }

  async listContactInquiries(businessProfileId: string): Promise<ContactInquiry[]> {
    const rows = await this.db.query<{
      id: string; business_profile_id: string | null; professional_profile_id: string | null; submitter_user_id: string;
      name: string; contact_email: string; message: string; status: string; tracking_status: string;
      request_id: string | null; correlation_id: string | null; created_at: Date;
    }>(
      `SELECT id,business_profile_id,professional_profile_id,submitter_user_id,name,contact_email,
              message,status,tracking_status,request_id,correlation_id,created_at
       FROM contact_inquiries WHERE business_profile_id=$1 ORDER BY created_at DESC`,
      [businessProfileId]
    );
    return rows.map((r) => this.mapInquiry(r));
  }

  async listProfessionalContactInquiries(professionalProfileId: string): Promise<ContactInquiry[]> {
    const rows = await this.db.query<InquiryRow>(
      `SELECT id,business_profile_id,professional_profile_id,submitter_user_id,name,contact_email,
              message,status,tracking_status,request_id,correlation_id,created_at
       FROM contact_inquiries WHERE professional_profile_id=$1 ORDER BY created_at DESC`,
      [professionalProfileId]
    );
    return rows.map((row) => this.mapInquiry(row));
  }

  async saveContactAction(event: ContactActionEvent): Promise<void> {
    await this.db.query(
      `INSERT INTO contact_action_events
         (id, business_profile_id, actor_user_id, action_type, request_id, correlation_id, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        event.id, event.businessProfileId, event.actorUserId ?? null,
        event.actionType, event.requestId ?? null, event.correlationId ?? null, event.createdAt
      ]
    );
  }

  async findBusinessProfileSnapshot(id: string): Promise<{ id: string; visibility: string; moderationStatus: string; trustStatus: string; status: string; ownerUserId: string } | undefined> {
    const rows = await this.db.query<{
      id: string; visibility: string; moderation_status: string; trust_status: string; status: string; owner_user_id: string;
    }>(
      `SELECT id, visibility, moderation_status, trust_status, status, owner_user_id FROM business_profiles WHERE id=$1 LIMIT 1`,
      [id]
    );
    if (!rows[0]) return undefined;
    return {
      id: rows[0].id,
      visibility: rows[0].visibility,
      moderationStatus: rows[0].moderation_status,
      trustStatus: rows[0].trust_status,
      status: rows[0].status,
      ownerUserId: rows[0].owner_user_id
    };
  }

  async findProfessionalProfileSnapshot(id: string): Promise<{ userIdentifier: string; visibility: string; moderationStatus: string; lifecycleStatus: string } | undefined> {
    const rows = await this.db.query<{ user_identifier: string; visibility: string; moderation_status: string; lifecycle_status: string }>(
      `SELECT user_identifier, visibility, moderation_status, lifecycle_status
       FROM professional_profiles WHERE professional_profile_identifier=$1 LIMIT 1`, [id]);
    return rows[0] ? { userIdentifier: rows[0].user_identifier, visibility: rows[0].visibility, moderationStatus: rows[0].moderation_status, lifecycleStatus: rows[0].lifecycle_status } : undefined;
  }

  private mapInquiry(r: {
    id: string; business_profile_id: string | null; professional_profile_id: string | null; submitter_user_id: string;
    name: string; contact_email: string; message: string; status: string; tracking_status: string;
    request_id: string | null; correlation_id: string | null; created_at: Date;
  }): ContactInquiry {
    return {
      id: r.id,
      businessProfileId: r.business_profile_id ?? undefined,
      professionalProfileId: r.professional_profile_id ?? undefined,
      submitterUserId: r.submitter_user_id,
      name: r.name,
      contactEmail: r.contact_email,
      message: r.message,
      status: r.status as ContactInquiry['status'],
      trackingStatus: r.tracking_status as ContactInquiry['trackingStatus'],
      requestId: r.request_id ?? undefined,
      correlationId: r.correlation_id ?? undefined,
      createdAt: r.created_at.toISOString()
    };
  }
}

type InquiryRow = {
  id: string; business_profile_id: string | null; professional_profile_id: string | null; submitter_user_id: string;
  name: string; contact_email: string; message: string; status: string; tracking_status: string;
  request_id: string | null; correlation_id: string | null; created_at: Date;
};

const INQUIRY_SELECT = `SELECT q.id,q.business_profile_id,q.professional_profile_id,q.submitter_user_id,q.name,q.contact_email,
  q.message,q.status,q.tracking_status,q.request_id,q.correlation_id,q.created_at,i.payload_fingerprint FROM contact_inquiries q`;

function isIdempotencyUniqueViolation(error: unknown): boolean {
  const databaseError = error as { code?: string; constraint?: string };
  return databaseError?.code === '23505' && databaseError.constraint === 'contact_submission_idempotency_submitter_key_unique';
}
