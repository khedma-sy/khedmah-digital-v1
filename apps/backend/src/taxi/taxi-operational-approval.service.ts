import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabasePool } from '../database/database.pool';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';

const REQUIRED_DOCUMENTS = ['driver_photo', 'identity_card', 'driving_license', 'vehicle_license'] as const;
type RequiredDocument = typeof REQUIRED_DOCUMENTS[number];
type OperationalStatus = 'approved' | 'suspended' | 'revoked';

interface BusinessRow extends Record<string, unknown> {
  id: string;
  name: string;
  owner_user_id: string;
  city_code: string;
  visibility: 'public' | 'private';
  moderation_status: string;
  trust_status: string;
  status: string;
}

interface ApprovalRow extends Record<string, unknown> {
  business_profile_id: string;
  user_id?: string;
  driver_user_id?: string;
  vehicle_id?: string;
  id?: string;
  zone_code?: string;
  status: OperationalStatus;
  revision: string;
  expires_at: Date;
}

interface LatestDocumentRow extends Record<string, unknown> {
  document_type: RequiredDocument;
  status: 'pending' | 'approved' | 'rejected';
  media_asset_id: string;
  created_at: Date;
}

export interface TaxiOperationalCandidate {
  readonly businessProfileId: string;
  readonly name: string;
  readonly ownerUserId: string;
  readonly cityCode: string;
  readonly profileReady: boolean;
  readonly visibility: string;
  readonly moderationStatus: string;
  readonly trustStatus: string;
  readonly businessStatus: string;
  readonly documents: Readonly<Record<RequiredDocument, 'missing' | 'pending' | 'approved' | 'rejected'>>;
  readonly documentsApproved: boolean;
  readonly operationalStatus?: OperationalStatus;
  readonly zoneCode?: string;
  readonly expiresAt?: string;
  readonly driverRevision?: string;
  readonly vehicleRevision?: string;
}

@Injectable()
export class TaxiOperationalApprovalService {
  constructor(
    @Inject(DatabasePool) private readonly db: DatabasePool,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(OperationsRbacService) private readonly rbac: OperationsRbacService
  ) {}

  async listCandidates(cookieHeader: string | undefined): Promise<TaxiOperationalCandidate[]> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    await this.assertSchemaReady();
    const businesses = await this.db.query<BusinessRow>(
      `SELECT id,name,owner_user_id,city_code,visibility,moderation_status,trust_status,status
       FROM business_profiles
       WHERE category_code='taxi'
       ORDER BY updated_at DESC,id
       LIMIT 200`
    );
    return Promise.all(businesses.map((business) => this.buildCandidate(business)));
  }

  async status(cookieHeader: string | undefined, businessProfileId: string): Promise<TaxiOperationalCandidate> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    await this.assertSchemaReady();
    const [business] = await this.db.query<BusinessRow>(
      `SELECT id,name,owner_user_id,city_code,visibility,moderation_status,trust_status,status
       FROM business_profiles WHERE id=$1 AND category_code='taxi' LIMIT 1`,
      [businessProfileId]
    );
    if (!business) throw new NotFoundException('Taxi business profile was not found.');
    if (business.owner_user_id !== actor.id) this.rbac.assert(actor.email, 'security.manage');
    return this.buildCandidate(business);
  }

  async approve(cookieHeader: string | undefined, businessProfileId: string, input: Record<string, unknown>) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    await this.assertSchemaReady();
    const zoneCode = this.zoneCode(input.zoneCode);
    const verificationReference = this.reference(input.verificationReference);
    const reason = this.reason(input.reason);
    const expiresAt = this.expiry(input.expiresAt);

    return this.db.transaction(async (client) => {
      const business = await this.lockBusiness(client, businessProfileId);
      if (business.owner_user_id === actor.id) throw new ForbiddenException('A Taxi reviewer cannot approve their own driver profile.');
      this.assertProfileReady(business);
      const documents = await this.latestDocumentsInTransaction(client, businessProfileId);
      const byType = new Map(documents.map((row) => [row.document_type, row.status]));
      if (REQUIRED_DOCUMENTS.some((type) => byType.get(type) !== 'approved')) {
        throw new ConflictException('All four latest Taxi documents must be approved before operational activation.');
      }

      const vehicleId = `taxi_vehicle_${business.id}`;
      const vehicle = await client.query<ApprovalRow>(
        `SELECT id,business_profile_id,driver_user_id,status,revision,expires_at
         FROM khedmah_taxi.vehicle_approvals WHERE business_profile_id=$1 FOR UPDATE`,
        [business.id]
      );
      const driver = await client.query<ApprovalRow>(
        `SELECT user_id,business_profile_id,vehicle_id,zone_code,status,revision,expires_at
         FROM khedmah_taxi.driver_approvals WHERE user_id=$1 FOR UPDATE`,
        [business.owner_user_id]
      );
      const currentVehicle = vehicle.rows[0];
      const currentDriver = driver.rows[0];
      if (currentVehicle?.driver_user_id && currentVehicle.driver_user_id !== business.owner_user_id) {
        throw new ConflictException('Taxi vehicle approval belongs to another driver.');
      }
      if (currentDriver?.business_profile_id && currentDriver.business_profile_id !== business.id) {
        throw new ConflictException('This driver already has another Taxi operational profile.');
      }
      const vehicleRevision = BigInt(currentVehicle?.revision ?? '0') + 1n;
      const driverRevision = BigInt(currentDriver?.revision ?? '0') + 1n;
      const now = new Date();

      await client.query(
        `INSERT INTO khedmah_taxi.vehicle_approvals
           (id,business_profile_id,driver_user_id,status,reviewed_by,verification_reference,decision_reason,approved_at,expires_at,revision,updated_at)
         VALUES($1,$2,$3,'approved',$4,$5,$6,$7,$8,$9,$7)
         ON CONFLICT(business_profile_id) DO UPDATE SET
           driver_user_id=EXCLUDED.driver_user_id,status='approved',reviewed_by=EXCLUDED.reviewed_by,
           verification_reference=EXCLUDED.verification_reference,decision_reason=EXCLUDED.decision_reason,
           approved_at=EXCLUDED.approved_at,expires_at=EXCLUDED.expires_at,revision=EXCLUDED.revision,updated_at=EXCLUDED.updated_at`,
        [vehicleId, business.id, business.owner_user_id, actor.id, verificationReference, reason,
          now.toISOString(), expiresAt.toISOString(), vehicleRevision.toString()]
      );
      const driverWrite = await client.query(
        `INSERT INTO khedmah_taxi.driver_approvals
           (user_id,business_profile_id,vehicle_id,zone_code,status,reviewed_by,verification_reference,decision_reason,approved_at,expires_at,revision,updated_at)
         VALUES($1,$2,$3,$4,'approved',$5,$6,$7,$8,$9,$10,$8)
         ON CONFLICT(user_id) DO UPDATE SET
           business_profile_id=EXCLUDED.business_profile_id,vehicle_id=EXCLUDED.vehicle_id,zone_code=EXCLUDED.zone_code,
           status='approved',reviewed_by=EXCLUDED.reviewed_by,verification_reference=EXCLUDED.verification_reference,
           decision_reason=EXCLUDED.decision_reason,approved_at=EXCLUDED.approved_at,expires_at=EXCLUDED.expires_at,
           revision=EXCLUDED.revision,updated_at=EXCLUDED.updated_at
         WHERE driver_approvals.business_profile_id=EXCLUDED.business_profile_id`,
        [business.owner_user_id, business.id, vehicleId, zoneCode, actor.id, verificationReference, reason,
          now.toISOString(), expiresAt.toISOString(), driverRevision.toString()]
      );
      // A missing driver row cannot be locked by the earlier SELECT. Two first
      // approvals for different profiles may both observe absence; recheck the
      // binding under the INSERT conflict lock and roll back the vehicle write.
      if (driverWrite.rowCount !== 1) {
        throw new ConflictException('This driver already has another Taxi operational profile.');
      }
      await this.insertEvent(client, {
        businessProfileId: business.id,
        driverUserId: business.owner_user_id,
        vehicleId,
        zoneCode,
        decision: 'approved',
        verificationReference,
        reason,
        actorUserId: actor.id,
        driverRevision,
        vehicleRevision
      });
      return {
        businessProfileId: business.id,
        driverUserId: business.owner_user_id,
        vehicleId,
        zoneCode,
        status: 'approved' as const,
        expiresAt: expiresAt.toISOString(),
        driverRevision: driverRevision.toString(),
        vehicleRevision: vehicleRevision.toString()
      };
    });
  }

  async restrict(cookieHeader: string | undefined, businessProfileId: string,
    decision: 'suspended' | 'revoked', input: Record<string, unknown>) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    await this.assertSchemaReady();
    const verificationReference = this.reference(input.verificationReference);
    const reason = this.reason(input.reason);

    return this.db.transaction(async (client) => {
      const business = await this.lockBusiness(client, businessProfileId);
      if (business.owner_user_id === actor.id) throw new ForbiddenException('A Taxi reviewer cannot change their own operational approval.');
      const vehicle = await client.query<ApprovalRow>(
        `SELECT id,business_profile_id,driver_user_id,status,revision,expires_at
         FROM khedmah_taxi.vehicle_approvals WHERE business_profile_id=$1 FOR UPDATE`,
        [business.id]
      );
      const driver = await client.query<ApprovalRow>(
        `SELECT user_id,business_profile_id,vehicle_id,zone_code,status,revision,expires_at
         FROM khedmah_taxi.driver_approvals WHERE business_profile_id=$1 FOR UPDATE`,
        [business.id]
      );
      const currentVehicle = vehicle.rows[0];
      const currentDriver = driver.rows[0];
      if (!currentVehicle || !currentDriver || !currentDriver.zone_code || !currentDriver.vehicle_id) {
        throw new ConflictException('Taxi operational approval does not exist.');
      }
      const vehicleRevision = BigInt(currentVehicle.revision) + 1n;
      const driverRevision = BigInt(currentDriver.revision) + 1n;
      const now = new Date().toISOString();
      await client.query(
        `UPDATE khedmah_taxi.vehicle_approvals SET status=$2,reviewed_by=$3,verification_reference=$4,
           decision_reason=$5,revision=$6,updated_at=$7 WHERE business_profile_id=$1`,
        [business.id, decision, actor.id, verificationReference, reason, vehicleRevision.toString(), now]
      );
      await client.query(
        `UPDATE khedmah_taxi.driver_approvals SET status=$2,reviewed_by=$3,verification_reference=$4,
           decision_reason=$5,revision=$6,updated_at=$7 WHERE business_profile_id=$1`,
        [business.id, decision, actor.id, verificationReference, reason, driverRevision.toString(), now]
      );
      await this.insertEvent(client, {
        businessProfileId: business.id,
        driverUserId: business.owner_user_id,
        vehicleId: currentDriver.vehicle_id,
        zoneCode: currentDriver.zone_code,
        decision,
        verificationReference,
        reason,
        actorUserId: actor.id,
        driverRevision,
        vehicleRevision
      });
      return {
        businessProfileId: business.id,
        status: decision,
        driverRevision: driverRevision.toString(),
        vehicleRevision: vehicleRevision.toString()
      };
    });
  }

  private async assertSchemaReady(): Promise<void> {
    try {
      const [row] = await this.db.query<{ ready: boolean }>(
        `SELECT to_regclass('khedmah_taxi.driver_approvals') IS NOT NULL
             AND to_regclass('khedmah_taxi.vehicle_approvals') IS NOT NULL
             AND to_regclass('khedmah_taxi.operational_approval_events') IS NOT NULL
             AND to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)') IS NOT NULL AS ready`
      );
      if (row?.ready !== true) throw new ServiceUnavailableException('Taxi operational approval schema is unavailable.');
    } catch (cause) {
      if (cause instanceof ServiceUnavailableException) throw cause;
      throw new ServiceUnavailableException('Taxi operational approval schema is unavailable.');
    }
  }

  private async buildCandidate(business: BusinessRow): Promise<TaxiOperationalCandidate> {
    const documents = await this.latestDocumentsFromPool(business.id);
    const documentState = Object.fromEntries(
      REQUIRED_DOCUMENTS.map((type) => [type, 'missing'])
    ) as Record<RequiredDocument, 'missing' | 'pending' | 'approved' | 'rejected'>;
    for (const row of documents) documentState[row.document_type] = row.status;
    const [driver] = await this.db.query<ApprovalRow>(
      `SELECT business_profile_id,user_id,vehicle_id,zone_code,status,revision,expires_at
       FROM khedmah_taxi.driver_approvals WHERE business_profile_id=$1 LIMIT 1`,
      [business.id]
    );
    const [vehicle] = await this.db.query<ApprovalRow>(
      `SELECT business_profile_id,id,driver_user_id,status,revision,expires_at
       FROM khedmah_taxi.vehicle_approvals WHERE business_profile_id=$1 LIMIT 1`,
      [business.id]
    );
    return {
      businessProfileId: business.id,
      name: business.name,
      ownerUserId: business.owner_user_id,
      cityCode: business.city_code,
      profileReady: this.profileReady(business),
      visibility: business.visibility,
      moderationStatus: business.moderation_status,
      trustStatus: business.trust_status,
      businessStatus: business.status,
      documents: documentState,
      documentsApproved: REQUIRED_DOCUMENTS.every((type) => documentState[type] === 'approved'),
      operationalStatus: driver?.status,
      zoneCode: driver?.zone_code,
      expiresAt: driver?.expires_at?.toISOString(),
      driverRevision: driver?.revision,
      vehicleRevision: vehicle?.revision
    };
  }

  private latestDocumentsSql(): string {
    return `SELECT DISTINCT ON (r.document_type)
         r.document_type,r.status,r.media_asset_id,m.created_at
       FROM mobility_document_reviews r
       JOIN media_assets m ON m.id=r.media_asset_id
       WHERE r.business_profile_id=$1
         AND m.owner_type='business_profile' AND m.owner_id=$1 AND m.visibility='private'
         AND m.asset_type=r.document_type
         AND r.document_type IN ('driver_photo','identity_card','driving_license','vehicle_license')
       ORDER BY r.document_type,m.created_at DESC,m.id DESC`;
  }

  private latestDocumentsFromPool(businessProfileId: string): Promise<LatestDocumentRow[]> {
    return this.db.query<LatestDocumentRow>(this.latestDocumentsSql(), [businessProfileId]);
  }

  private async latestDocumentsInTransaction(client: PoolClient, businessProfileId: string): Promise<LatestDocumentRow[]> {
    const result = await client.query<LatestDocumentRow>(this.latestDocumentsSql(), [businessProfileId]);
    return result.rows;
  }

  private async lockBusiness(client: PoolClient, businessProfileId: string): Promise<BusinessRow> {
    const result = await client.query<BusinessRow>(
      `SELECT id,name,owner_user_id,city_code,visibility,moderation_status,trust_status,status
       FROM business_profiles WHERE id=$1 AND category_code='taxi' FOR UPDATE`,
      [businessProfileId]
    );
    const business = result.rows[0];
    if (!business) throw new NotFoundException('Taxi business profile was not found.');
    return business;
  }

  private profileReady(business: BusinessRow): boolean {
    return business.visibility === 'public' && business.moderation_status === 'approved'
      && business.trust_status === 'approved' && business.status === 'active';
  }

  private assertProfileReady(business: BusinessRow): void {
    if (!this.profileReady(business)) {
      throw new ConflictException('Taxi business must be public, moderated, trusted and active before operational activation.');
    }
  }

  private zoneCode(value: unknown): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value.trim())) {
      throw new BadRequestException('Taxi zone code is invalid.');
    }
    return value.trim();
  }

  private reference(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length < 5 || value.trim().length > 200) {
      throw new BadRequestException('Taxi verification reference must be between 5 and 200 characters.');
    }
    return value.trim();
  }

  private reason(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length < 10 || value.trim().length > 500) {
      throw new BadRequestException('Taxi operational decision reason must be between 10 and 500 characters.');
    }
    return value.trim();
  }

  private expiry(value: unknown): Date {
    if (typeof value !== 'string') throw new BadRequestException('Taxi operational expiry is required.');
    const date = new Date(value);
    const now = Date.now();
    if (!Number.isFinite(date.getTime())
      || date.getTime() <= now + 60 * 60 * 1000
      || date.getTime() > now + 2 * 365 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Taxi operational expiry must be between one hour and two years from now.');
    }
    return date;
  }

  private async insertEvent(client: PoolClient, input: {
    businessProfileId: string;
    driverUserId: string;
    vehicleId: string;
    zoneCode: string;
    decision: OperationalStatus;
    verificationReference: string;
    reason: string;
    actorUserId: string;
    driverRevision: bigint;
    vehicleRevision: bigint;
  }): Promise<void> {
    await client.query(
      `INSERT INTO khedmah_taxi.operational_approval_events
         (id,business_profile_id,driver_user_id,vehicle_id,zone_code,decision,verification_reference,reason,
          actor_user_id,driver_revision,vehicle_revision,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
      [randomUUID(), input.businessProfileId, input.driverUserId, input.vehicleId, input.zoneCode,
        input.decision, input.verificationReference, input.reason, input.actorUserId,
        input.driverRevision.toString(), input.vehicleRevision.toString()]
    );
  }
}
