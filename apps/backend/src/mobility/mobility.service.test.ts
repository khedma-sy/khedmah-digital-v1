import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MobilityService } from './mobility.service';
import type { MobilityRequest } from './mobility.types';

const now = new Date().toISOString();
const validInput = { providerBusinessId: 'taxi-1', serviceType: 'taxi', pickupAddress: 'ساحة الأمويين', destinationAddress: 'باب توما', riderContactPhone: '0999999999', pickupLatitude: 33.51, pickupLongitude: 36.27, destinationLatitude: 33.515, destinationLongitude: 36.31 };
const business = { id: 'taxi-1', ownerUserId: 'driver-1', categoryCode: 'taxi', visibility: 'public', moderationStatus: 'approved', trustStatus: 'approved', status: 'active' };
const request: MobilityRequest = { id: 'request-1', riderUserId: 'rider-1', ...validInput, providerOwnerUserId: 'driver-1', providerName: 'تكسي موثق', deliveryContractVersion:1, status: 'requested', fareStatus:'pending', fareCurrency:'SYP', createdAt: now, updatedAt: now };

test('eligible rider creates one auditable request and does not expose internal user identifiers', async () => {
  const saved: MobilityRequest[] = [];
  const repository = { findByRiderIdempotency: async () => undefined, create: async (value: MobilityRequest) => { saved.push(value); return { ...value, providerOwnerUserId: 'driver-1' }; } };
  const audits: string[] = [];
  const service = new MobilityService(repository as never, { findById: async () => business, countApprovedMobilityDocuments: async () => 4 } as never, { getCurrentUser: async () => ({ id: 'rider-1' }) } as never, { appendAuditLog: async (event: string) => audits.push(event) } as never, {} as never, { calculate: async () => 3500 } as never);
  const result = await service.create(undefined, validInput, '1234567890abcdef');
  assert.equal(saved.length, 1); assert.equal(result.status, 'requested'); assert.equal('riderUserId' in result, false); assert.equal('providerOwnerUserId' in result, false);
  assert.deepEqual(audits, ['mobility.request.created']);
});

test('untrusted provider and self-request fail closed', async () => {
  const repository = { findByRiderIdempotency: async () => undefined };
  const identity = { getCurrentUser: async () => ({ id: 'rider-1' }) };
  const untrusted = new MobilityService(repository as never, { findById: async () => ({ ...business, trustStatus: 'pending' }) } as never, identity as never, {} as never, {} as never, { calculate: async () => 3500 } as never);
  await assert.rejects(() => untrusted.create(undefined, validInput, '1234567890abcdef'), BadRequestException);
  const undocumented = new MobilityService(repository as never, { findById: async () => business, countApprovedMobilityDocuments: async () => 3 } as never, identity as never, {} as never, {} as never, { calculate: async () => 3500 } as never);
  await assert.rejects(() => undocumented.create(undefined, validInput, '1234567890abcdef'), BadRequestException);
  const self = new MobilityService(repository as never, { findById: async () => ({ ...business, ownerUserId: 'rider-1' }), countApprovedMobilityDocuments: async () => 4 } as never, identity as never, {} as never, {} as never, { calculate: async () => 3500 } as never);
  await assert.rejects(() => self.create(undefined, validInput, '1234567890abcdef'), BadRequestException);
});

test('only provider follows provider lifecycle and unrelated users are forbidden', async () => {
  const repository = { findById: async () => request, transition: async (_request: MobilityRequest, _from: string, next: MobilityRequest['status']) => ({ ...request, status: next }) };
  let actor = 'stranger';
  const service = new MobilityService(repository as never, {} as never, { getCurrentUser: async () => ({ id: actor }) } as never, { appendAuditLog: async () => undefined } as never, {} as never, { calculate: async () => 3500 } as never);
  await assert.rejects(() => service.transition(undefined, request.id, { status: 'accepted' }), ForbiddenException);
  actor = 'driver-1';
  assert.equal((await service.transition(undefined, request.id, { status: 'accepted' })).status, 'accepted');
  actor = 'rider-1';
  await assert.rejects(() => service.transition(undefined, request.id, { status: 'completed' }), BadRequestException);
});

test('meter start freezes the approved fare policy on the trip',async()=>{
  const arrived:MobilityRequest={...request,status:'arrived',arrivedAt:'2026-09-04T10:00:00.000Z'};
  let captured:unknown;
  const repository={findById:async()=>arrived,findFarePolicy:async()=>({serviceType:'taxi',enabled:true,currency:'SYP',baseFare:5000,perKmFare:2000,perWaitingMinuteFare:500,minimumFare:7000,updatedAt:'2026-09-04T09:00:00.000Z'}),transition:async(_request:MobilityRequest,_from:string,next:MobilityRequest['status'],_actor:string,_reason?:string,fare?:unknown)=>{captured=fare;return{...arrived,status:next};}};
  const service=new MobilityService(repository as never,{} as never,{getCurrentUser:async()=>({id:'driver-1'})} as never,{appendAuditLog:async()=>undefined} as never,{} as never,{calculate:async()=>3500} as never);
  await service.transition(undefined,arrived.id,{status:'in_progress'});
  assert.deepEqual(captured,{baseFare:5000,perKmFare:2000,perWaitingMinuteFare:500,minimumFare:7000,policyUpdatedAt:'2026-09-04T09:00:00.000Z'});
});

test('platform calculates the final fare from the tariff frozen at meter start', async () => {
  const trip:MobilityRequest={...request,status:'in_progress',arrivedAt:'2026-09-04T10:00:00.000Z',startedAt:'2026-09-04T10:05:30.000Z',
    baseFare:5000,farePerKm:2000,farePerWaitingMinute:500,fareMinimum:7000,farePolicyUpdatedAt:'2026-09-04T09:00:00.000Z'};
  let captured:unknown;
  const repository={findById:async()=>trip,findFarePolicy:async()=>{throw new Error('completion must not read a changed policy');},transition:async(_request:MobilityRequest,_from:string,next:MobilityRequest['status'],_actor:string,_reason?:string,fare?:unknown)=>{captured=fare;return{...trip,status:next,...fare,fareStatus:'finalized'};}};
  const service=new MobilityService(repository as never,{} as never,{getCurrentUser:async()=>({id:'driver-1'})} as never,{appendAuditLog:async()=>undefined} as never,{} as never,{calculate:async()=>3500} as never);
  const result=await service.transition(undefined,trip.id,{status:'completed'});
  assert.deepEqual(captured,{distanceMeters:3500,waitingSeconds:330,baseFare:5000,perKmFare:2000,perWaitingMinuteFare:500,minimumFare:7000,
    policyUpdatedAt:'2026-09-04T09:00:00.000Z',distanceFare:7000,waitingFare:3000,finalFare:15000});
  assert.equal(result.status,'completed');
});

test('contact numbers stay hidden until provider accepts the request', async () => {
  const repository={listForProvider:async()=>[{...request,providerPhone:'0111111111'}]};
  const service=new MobilityService(repository as never,{findById:async()=>business} as never,{getCurrentUser:async()=>({id:'driver-1'})} as never,{} as never,{} as never,{calculate:async()=>3500} as never);
  const [pending]=await service.listForProvider(undefined,'taxi-1');
  assert.equal(pending.riderContactPhone,undefined);
});

test('delivery creation requires its own package and recipient contract and issues one-time proof pins', async () => {
  const deliveryInput={...validInput,providerBusinessId:'delivery-1',serviceType:'delivery',packageDescription:'وثائق رسمية',packageSize:'small',recipientName:'ليلى أحمد',recipientPhone:'0988888888',deliveryInstructions:'اتصل عند الوصول'};
  let saved:MobilityRequest|undefined;
  const deliveryBusiness={...business,id:'delivery-1',categoryCode:'delivery_courier'};
  const repository={findByRiderIdempotency:async()=>undefined,create:async(value:MobilityRequest)=>{saved=value;return{...value,providerOwnerUserId:'driver-1'};}};
  const service=new MobilityService(repository as never,{findById:async()=>deliveryBusiness,countApprovedMobilityDocuments:async()=>4} as never,
    {getCurrentUser:async()=>({id:'rider-1'})} as never,{appendAuditLog:async()=>undefined} as never,{} as never,{calculate:async()=>3500} as never);
  const result=await service.create(undefined,deliveryInput,'delivery-key-0001');
  assert.match(result.pickupProofPin!,/^\d{6}$/); assert.match(result.deliveryProofPin!,/^\d{6}$/);
  assert.match(saved!.pickupVerificationHash!,/^[a-f0-9]{32}:[a-f0-9]{64}$/);
  assert.equal(saved!.deliveryContractVersion,2);
  assert.equal('pickupVerificationHash' in result,false); assert.equal('deliveryVerificationHash' in result,false);
  assert.equal(result.recipientPhone,'0988888888');
});

test('taxi rejects delivery-only fields and delivery requires complete details', async () => {
  const repository={findByRiderIdempotency:async()=>undefined};
  const service=new MobilityService(repository as never,{} as never,{getCurrentUser:async()=>({id:'rider-1'})} as never,{} as never,{} as never,{calculate:async()=>3500} as never);
  await assert.rejects(()=>service.create(undefined,{...validInput,packageSize:'small'},'taxi-key-00000001'),BadRequestException);
  await assert.rejects(()=>service.create(undefined,{...validInput,serviceType:'delivery'},'delivery-key-0002'),BadRequestException);
});

test('delivery pickup and drop-off require the correct secret proof in order', async () => {
  const deliveryInput={...validInput,providerBusinessId:'delivery-1',serviceType:'delivery',packageDescription:'طرد صغير',packageSize:'small',recipientName:'ليلى أحمد',recipientPhone:'0988888888'};
  let created:MobilityRequest|undefined;
  const createRepository={findByRiderIdempotency:async()=>undefined,create:async(value:MobilityRequest)=>{created={...value,providerOwnerUserId:'driver-1'};return created;}};
  const createService=new MobilityService(createRepository as never,{findById:async()=>({...business,id:'delivery-1',categoryCode:'delivery_courier'}),countApprovedMobilityDocuments:async()=>4} as never,
    {getCurrentUser:async()=>({id:'rider-1'})} as never,{appendAuditLog:async()=>undefined} as never,{} as never,{calculate:async()=>3500} as never);
  const secrets=await createService.create(undefined,deliveryInput,'delivery-key-0003');
  const atPickup={...created!,status:'arrived' as const,arrivedAt:'2026-09-04T10:00:00.000Z'};
  let proof:unknown;
  const pickupRepository={findById:async()=>atPickup,findFarePolicy:async()=>({serviceType:'delivery',enabled:true,currency:'SYP',baseFare:1000,perKmFare:500,perWaitingMinuteFare:0,minimumFare:1000,updatedAt:now}),
    transition:async(_request:MobilityRequest,_from:string,next:MobilityRequest['status'],_actor:string,_reason?:string,_fare?:unknown,value?:unknown)=>{proof=value;return{...atPickup,status:next,pickupVerifiedAt:now};}};
  const pickupService=new MobilityService(pickupRepository as never,{} as never,{getCurrentUser:async()=>({id:'driver-1'})} as never,{appendAuditLog:async()=>undefined} as never,{} as never,{calculate:async()=>3500} as never);
  await assert.rejects(()=>pickupService.transition(undefined,atPickup.id,{status:'in_progress',verificationCode:'000000'}),BadRequestException);
  await pickupService.transition(undefined,atPickup.id,{status:'in_progress',verificationCode:secrets.pickupProofPin});
  assert.deepEqual(proof,{pickupVerified:true});

  const beforeDropoff={...atPickup,status:'in_progress' as const,pickupVerifiedAt:now,startedAt:now,baseFare:1000,farePerKm:500,farePerWaitingMinute:0,fareMinimum:1000,farePolicyUpdatedAt:now};
  const deliveryRepository={findById:async()=>beforeDropoff,transition:async(_request:MobilityRequest,_from:string,next:MobilityRequest['status'],_actor:string,_reason?:string,_fare?:unknown,value?:unknown)=>{proof=value;return{...beforeDropoff,status:next,deliveryVerifiedAt:now};}};
  const deliveryService=new MobilityService(deliveryRepository as never,{} as never,{getCurrentUser:async()=>({id:'driver-1'})} as never,{appendAuditLog:async()=>undefined} as never,{} as never,{calculate:async()=>1000} as never);
  await deliveryService.transition(undefined,beforeDropoff.id,{status:'completed',verificationCode:secrets.deliveryProofPin});
  assert.deepEqual(proof,{deliveryVerified:true});
});
