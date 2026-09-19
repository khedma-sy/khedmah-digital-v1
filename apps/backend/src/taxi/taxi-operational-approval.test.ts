import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TaxiOperationalApprovalService } from './taxi-operational-approval.service';

const admin = { id: 'admin-1', email: 'admin@example.test', status: 'active', profile: { displayName: 'Admin', locale: 'ar' } } as const;
const owner = { id: 'driver-1', email: 'driver@example.test', status: 'active', profile: { displayName: 'Driver', locale: 'ar' } } as const;

const business = {
  id: 'taxi-business-1',
  name: 'Taxi Driver',
  owner_user_id: owner.id,
  city_code: 'damascus',
  visibility: 'public',
  moderation_status: 'approved',
  trust_status: 'approved',
  status: 'active'
};

const approvedDocuments = [
  { document_type: 'driver_photo', status: 'approved', media_asset_id: 'm1', created_at: new Date() },
  { document_type: 'identity_card', status: 'approved', media_asset_id: 'm2', created_at: new Date() },
  { document_type: 'driving_license', status: 'approved', media_asset_id: 'm3', created_at: new Date() },
  { document_type: 'vehicle_license', status: 'approved', media_asset_id: 'm4', created_at: new Date() }
];

function serviceHarness(options: {
  actor?: typeof admin | typeof owner;
  business?: typeof business;
  documents?: typeof approvedDocuments;
  schemaReady?: boolean;
  driverApproval?: Record<string, unknown>;
  vehicleApproval?: Record<string, unknown>;
  denyRbac?: boolean;
  concurrentDriverConflict?: boolean;
} = {}) {
  const writes: Array<{ sql: string; params?: readonly unknown[] }> = [];
  const selectedBusiness = options.business ?? business;
  const documents = options.documents ?? approvedDocuments;
  const client = {
    async query(sql: string, params?: readonly unknown[]) {
      if (sql.includes('FROM business_profiles') && sql.includes('FOR UPDATE')) return { rows: [selectedBusiness] };
      if (sql.includes('FROM mobility_document_reviews')) return { rows: documents };
      if (sql.includes('FROM khedmah_taxi.vehicle_approvals') && sql.includes('FOR UPDATE')) return { rows: options.vehicleApproval ? [options.vehicleApproval] : [] };
      if (sql.includes('FROM khedmah_taxi.driver_approvals') && sql.includes('FOR UPDATE')) return { rows: options.driverApproval ? [options.driverApproval] : [] };
      writes.push({ sql, params });
      if (options.concurrentDriverConflict && sql.includes('INSERT INTO khedmah_taxi.driver_approvals')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    }
  };
  const db = {
    async query(sql: string) {
      if (sql.includes("to_regclass('khedmah_taxi.driver_approvals')")) return [{ ready: options.schemaReady ?? true }];
      return [];
    },
    async transaction<T>(work: (transactionClient: typeof client) => Promise<T>) { return work(client); }
  };
  const identity = { async getCurrentUser() { return options.actor ?? admin; } };
  const rbac = { assert() { if (options.denyRbac) throw new ForbiddenException('denied'); } };
  const service = new TaxiOperationalApprovalService(db as never, identity as never, rbac as never);
  return { service, writes };
}

const approvalInput = () => ({
  zoneCode: 'damascus-central',
  verificationReference: 'review-case-1001',
  reason: 'All identity, driving and vehicle requirements were reviewed by Khedmah operations.',
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
});

test('Taxi operational approval is unavailable until canonical Migration 031 is present', async () => {
  const { service } = serviceHarness({ schemaReady: false });
  await assert.rejects(service.approve('session=example', business.id, approvalInput()), ServiceUnavailableException);
});

test('Taxi operational candidate queue and decisions remain security.manage gated', async () => {
  const { service } = serviceHarness({ denyRbac: true });
  await assert.rejects(service.listCandidates('session=example'), ForbiddenException);
  await assert.rejects(service.approve('session=example', business.id, approvalInput()), ForbiddenException);
});

test('a reviewer can never operationally approve their own Taxi profile', async () => {
  const { service } = serviceHarness({ actor: owner });
  await assert.rejects(service.approve('session=example', business.id, approvalInput()), ForbiddenException);
});

test('Taxi activation requires public moderated trusted active business state', async () => {
  const { service } = serviceHarness({ business: { ...business, trust_status: 'pending' } });
  await assert.rejects(service.approve('session=example', business.id, approvalInput()), ConflictException);
});

test('Taxi activation requires all four latest driver and vehicle documents approved', async () => {
  const { service } = serviceHarness({ documents: approvedDocuments.map((document) => document.document_type === 'vehicle_license' ? { ...document, status: 'rejected' } : document) as typeof approvedDocuments });
  await assert.rejects(service.approve('session=example', business.id, approvalInput()), ConflictException);
});

test('approved Taxi activation writes driver vehicle and immutable event in one transaction', async () => {
  const { service, writes } = serviceHarness();
  const result = await service.approve('session=example', business.id, approvalInput());
  assert.equal(result.status, 'approved');
  assert.equal(result.driverUserId, owner.id);
  assert.equal(result.vehicleId, `taxi_vehicle_${business.id}`);
  assert.equal(result.zoneCode, 'damascus-central');
  assert.equal(writes.length, 3);
  assert.match(writes[0].sql, /INSERT INTO khedmah_taxi\.vehicle_approvals/);
  assert.match(writes[1].sql, /INSERT INTO khedmah_taxi\.driver_approvals/);
  assert.match(writes[2].sql, /INSERT INTO khedmah_taxi\.operational_approval_events/);
});

test('Taxi activation increments existing approval revisions instead of replacing audit lineage', async () => {
  const { service } = serviceHarness({
    vehicleApproval: { business_profile_id: business.id, driver_user_id: owner.id, id: `taxi_vehicle_${business.id}`, status: 'approved', revision: '7', expires_at: new Date(Date.now() + 100000) },
    driverApproval: { business_profile_id: business.id, user_id: owner.id, vehicle_id: `taxi_vehicle_${business.id}`, zone_code: 'old-zone', status: 'approved', revision: '9', expires_at: new Date(Date.now() + 100000) }
  });
  const result = await service.approve('session=example', business.id, approvalInput());
  assert.equal(result.vehicleRevision, '8');
  assert.equal(result.driverRevision, '10');
});

test('one driver cannot silently activate a second Taxi business profile', async () => {
  const { service } = serviceHarness({ driverApproval: {
    business_profile_id: 'another-taxi-business', user_id: owner.id, vehicle_id: 'another-vehicle', zone_code: 'damascus', status: 'approved', revision: '1', expires_at: new Date(Date.now() + 100000)
  } });
  await assert.rejects(service.approve('session=example', business.id, approvalInput()), ConflictException);
});

test('a driver binding created after the precheck rejects approval before the audit event', async () => {
  const { service, writes } = serviceHarness({ concurrentDriverConflict: true });
  await assert.rejects(service.approve('session=example', business.id, approvalInput()), ConflictException);
  assert.equal(writes.some(write => write.sql.includes('INSERT INTO khedmah_taxi.operational_approval_events')), false);
});
