import type { Command, Address, TrustedRoute, Quote, Actor, TaxiAssignment } from '../domain.js';
import type { RuntimePorts, SqlClient, ReferenceSnapshot } from './ports.js';
import { fail, only, id, requestKey, obj } from './input.js';
export interface TaxiPorts extends RuntimePorts {
  assignment?: (client: SqlClient, actor: Actor) => TaxiAssignment | undefined;
  validateQuote?: (client: SqlClient, actor: Actor, quote: Quote) => Promise<void>;
  /** Approved routing/coverage provider. Must fail closed; never use a straight-line fare fallback. */
  route: (client: SqlClient, from: Address, to: Address, references: ReferenceSnapshot) => Promise<TrustedRoute>;
}
export function taxiAddress(value: unknown): Address {
  const v=only(value,['area','detail','latitude','longitude']);
  for (const [field,max] of [['area',80],['detail',300]] as const)
    if(typeof v[field] !== 'string' || !v[field].trim() || v[field].trim().length>max) fail('INVALID_INPUT',400,'العنوان غير صالح.');
  if(typeof v.latitude !== 'number' || !Number.isFinite(v.latitude) || Math.abs(v.latitude)>90
    || typeof v.longitude !== 'number' || !Number.isFinite(v.longitude) || Math.abs(v.longitude)>180)
    fail('INVALID_COORDINATES',400,'حدد نقطتي الانطلاق والوجهة على الخريطة.');
  return {area:(v.area as string).trim(),detail:(v.detail as string).trim(),latitude:v.latitude,longitude:v.longitude};
}
export function taxiQuoteInput(value:unknown) {
  const v=only(value,['pickup','dropoff']),pickup=taxiAddress(v.pickup),dropoff=taxiAddress(v.dropoff);
  if(pickup.latitude===dropoff.latitude && pickup.longitude===dropoff.longitude) fail('SAME_ADDRESS',400,'الوجهة تطابق نقطة الانطلاق.');
  return {pickup,dropoff};
}
const fields: Record<string,string[]>={accept_job:[],arrive_pickup:['proofId'],start_ride:['proofId'],finish_ride:['proofId'],
  cancel:[],release_job:['reason'],report_issue:['reason'],resolve_issue:['issueId','reason'],record_cash:['amountMinor'],settle_cash:[],rate:['rating']};
export type TaxiCommand=Command & {proofId?:string};
export const taxiRequiresProof=(action:string)=>['arrive_pickup','start_ride','finish_ride'].includes(action);
export function taxiCommandInput(value:unknown):TaxiCommand {
  const v=obj(value),allowed=typeof v.action==='string' && Object.hasOwn(fields,v.action)?fields[v.action]:undefined;
  if(!allowed) fail('UNKNOWN_ACTION',400,'الإجراء غير مدعوم في التكسي.');
  only(v,['action','expectedVersion','requestId',...allowed]); requestKey(v.requestId);
  if(!Number.isSafeInteger(v.expectedVersion) || Number(v.expectedVersion)<1) fail('INVALID_VERSION',400,'نسخة الرحلة غير صالحة.');
  if(taxiRequiresProof(String(v.action))) id(v.proofId);
  if(v.issueId!==undefined) id(v.issueId);
  return structuredClone(v) as unknown as TaxiCommand;
}
