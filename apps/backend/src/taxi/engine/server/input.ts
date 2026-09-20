import { JourneyError, type Command } from '../domain.js';
export function fail(code: string, status: number, message: string): never { throw new JourneyError(code, status, message); }
export function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_INPUT',400,'بيانات الطلب غير صالحة.');
  return value as Record<string, unknown>;
}
export function only(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  const body=obj(value);
  if (Object.keys(body).some(k=>!allowed.includes(k))) fail('UNSUPPORTED_FIELD',400,'يحتوي الطلب على حقل غير مسموح.');
  return body;
}
export function id(value: unknown): string {
  if (typeof value!=='string' || !/^[A-Za-z0-9:_-]{1,100}$/.test(value)) fail('INVALID_ID',400,'المعرف غير صالح.');
  return value;
}
export function requestKey(value: unknown): string {
  if (typeof value!=='string' || !/^[A-Za-z0-9_-]{16,100}$/.test(value)) fail('INVALID_KEY',400,'مفتاح المحاولة غير صالح.');
  return value;
}
export function addressInput(value: unknown): Record<string, unknown> {
  return only(value,['area','detail','latitude','longitude']);
}
export function quoteInput(value: unknown): Record<string, unknown> {
  const v=only(value,['restaurantId','method','items','dropoff']);id(v.restaurantId);
  if (!['courier','merchant','pickup'].includes(String(v.method))) fail('INVALID_METHOD',400,'اختر طريقة الاستلام.');
  if (!Array.isArray(v.items) || v.items.length<1 || v.items.length>30) fail('EMPTY_CART',400,'السلة فارغة أو تتجاوز الحد.');
  for (const item of v.items) { const line=only(item,['id','quantity']);id(line.id); }
  if (v.method!=='pickup') addressInput(v.dropoff);
  else if (v.dropoff!==undefined) fail('UNSUPPORTED_FIELD',400,'طلب الاستلام من المطعم لا يحتاج عنوان توصيل.');
  return v;
}
const proofActions = new Set(['arrive_pickup','pickup','arrive_destination','deliver','confirm_pickup']);
const actionFields: Record<string, string[]> = {
  accept_food:[],reject_food:['reason'],prepare:[],ready:[],accept_job:[],
  arrive_pickup:['proofId'],pickup:['proofId'],arrive_destination:['proofId'],deliver:['proofId'],confirm_pickup:['proofId'],
  cancel:[],report_issue:['reason'],resolve_issue:['reason','issueId'],record_cash:['amountMinor'],settle_cash:[],rate:['rating']
};
export type FoodCommand = Command & { proofId?: string };
export function commandInput(value: unknown): FoodCommand {
  const v=obj(value), fields=typeof v.action==='string' && Object.hasOwn(actionFields,v.action) ? actionFields[v.action] : undefined;
  if (!fields) fail('UNKNOWN_ACTION',400,'هذا الإجراء غير مدعوم في فود.');
  only(v,['action','expectedVersion','requestId',...fields]);requestKey(v.requestId);
  if (!Number.isSafeInteger(v.expectedVersion) || Number(v.expectedVersion)<1) fail('INVALID_VERSION',400,'نسخة الطلب غير صالحة.');
  if (proofActions.has(String(v.action))) id(v.proofId);
  if (v.issueId!==undefined) id(v.issueId);
  return structuredClone(v) as unknown as FoodCommand;
}
export const requiresProof=(action:string)=>proofActions.has(action);
