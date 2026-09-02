import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MobilityService } from './mobility.service';
import type { MobilityRequest } from './mobility.types';

const now = new Date().toISOString();
const validInput = { providerBusinessId: 'taxi-1', serviceType: 'taxi', pickupAddress: 'ساحة الأمويين', destinationAddress: 'باب توما', riderContactPhone: '0999999999', pickupLatitude: 33.51, pickupLongitude: 36.27 };
const business = { id: 'taxi-1', ownerUserId: 'driver-1', categoryCode: 'taxi', visibility: 'public', moderationStatus: 'approved', trustStatus: 'approved', status: 'active' };
const request: MobilityRequest = { id: 'request-1', riderUserId: 'rider-1', ...validInput, providerOwnerUserId: 'driver-1', providerName: 'تكسي موثق', status: 'requested', createdAt: now, updatedAt: now };

test('eligible rider creates one auditable request and does not expose internal user identifiers', async () => {
  const saved: MobilityRequest[] = [];
  const repository = { findByRiderIdempotency: async () => undefined, create: async (value: MobilityRequest) => { saved.push(value); return { ...value, providerOwnerUserId: 'driver-1' }; } };
  const audits: string[] = [];
  const service = new MobilityService(repository as never, { findById: async () => business } as never, { getCurrentUser: async () => ({ id: 'rider-1' }) } as never, { appendAuditLog: async (event: string) => audits.push(event) } as never);
  const result = await service.create(undefined, validInput, '1234567890abcdef');
  assert.equal(saved.length, 1); assert.equal(result.status, 'requested'); assert.equal('riderUserId' in result, false); assert.equal('providerOwnerUserId' in result, false);
  assert.deepEqual(audits, ['mobility.request.created']);
});

test('untrusted provider and self-request fail closed', async () => {
  const repository = { findByRiderIdempotency: async () => undefined };
  const identity = { getCurrentUser: async () => ({ id: 'rider-1' }) };
  const untrusted = new MobilityService(repository as never, { findById: async () => ({ ...business, trustStatus: 'pending' }) } as never, identity as never, {} as never);
  await assert.rejects(() => untrusted.create(undefined, validInput, '1234567890abcdef'), BadRequestException);
  const self = new MobilityService(repository as never, { findById: async () => ({ ...business, ownerUserId: 'rider-1' }) } as never, identity as never, {} as never);
  await assert.rejects(() => self.create(undefined, validInput, '1234567890abcdef'), BadRequestException);
});

test('only provider follows provider lifecycle and unrelated users are forbidden', async () => {
  const repository = { findById: async () => request, transition: async (_request: MobilityRequest, _from: string, next: MobilityRequest['status']) => ({ ...request, status: next }) };
  let actor = 'stranger';
  const service = new MobilityService(repository as never, {} as never, { getCurrentUser: async () => ({ id: actor }) } as never, { appendAuditLog: async () => undefined } as never);
  await assert.rejects(() => service.transition(undefined, request.id, { status: 'accepted' }), ForbiddenException);
  actor = 'driver-1';
  assert.equal((await service.transition(undefined, request.id, { status: 'accepted' })).status, 'accepted');
  actor = 'rider-1';
  await assert.rejects(() => service.transition(undefined, request.id, { status: 'completed' }), BadRequestException);
});
