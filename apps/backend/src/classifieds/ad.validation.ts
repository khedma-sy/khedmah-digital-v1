import { BadRequestException } from '@nestjs/common';
import { validateCategoryCode } from '../categories/category.validation';
import type { AdContactMode, AdContentInput, AdContentPatch, AdKind, AdPriceMode } from './ad.types';

const KINDS: readonly AdKind[] = ['sale', 'service', 'wanted', 'rent'];
const PRICE_MODES: readonly AdPriceMode[] = ['fixed', 'negotiable', 'contact', 'none'];
const CONTACT_MODES: readonly AdContactMode[] = ['profile', 'phone', 'whatsapp'];
const CURRENCIES = ['SYP', 'USD'] as const;
const CONTENT_KEYS = [
  'businessProfileId', 'kind', 'titleAr', 'descriptionAr', 'categoryCode', 'priceMode', 'priceMinor', 'currency',
  'cityCode', 'areaText', 'contactMode', 'contactValue', 'expiresAt'
] as const;

export interface ValidatedAdCreate {
  readonly clientRequestId: string;
  readonly input: AdContentInput;
}

export interface ValidatedAdUpdate {
  readonly clientRequestId: string;
  readonly expectedContentRevision: number;
  readonly patch: AdContentPatch;
}

export interface ValidatedAdRevisionAction {
  readonly clientRequestId: string;
  readonly expectedRevision: number;
}

export interface ValidatedAdModeration {
  readonly expectedReviewRevision: number;
  readonly decision: 'approved' | 'rejected';
  readonly reason?: string;
}

export function validateAdCreate(value: unknown): ValidatedAdCreate {
  const body = asRecord(value);
  rejectUnknown(body, new Set([...CONTENT_KEYS, 'clientRequestId']));
  const input = readContent(body, false) as AdContentInput;
  validateContracts(input);
  return { clientRequestId: requestId(body.clientRequestId), input };
}

export function validateAdUpdate(value: unknown): ValidatedAdUpdate {
  const body = asRecord(value);
  rejectUnknown(body, new Set([...CONTENT_KEYS, 'clientRequestId', 'expectedContentRevision']));
  const patch = readContent(body, true) as AdContentPatch;
  if (Object.keys(patch).length === 0) throw new BadRequestException('At least one ad content field is required.');
  validateContracts(patch, true);
  return {
    clientRequestId: requestId(body.clientRequestId),
    expectedContentRevision: positiveInteger(body.expectedContentRevision, 'expectedContentRevision'),
    patch
  };
}

export function validateAdSubmit(value: unknown): { clientRequestId: string } {
  const body = asRecord(value);
  rejectUnknown(body, new Set(['clientRequestId']));
  return { clientRequestId: requestId(body.clientRequestId) };
}

export function validateAdRevisionAction(value: unknown): ValidatedAdRevisionAction {
  const body = asRecord(value);
  rejectUnknown(body, new Set(['clientRequestId', 'expectedRevision']));
  return {
    clientRequestId: requestId(body.clientRequestId),
    expectedRevision: positiveInteger(body.expectedRevision, 'expectedRevision')
  };
}

export function validateAdModeration(value: unknown): ValidatedAdModeration {
  const body = asRecord(value);
  rejectUnknown(body, new Set(['expectedReviewRevision', 'decision', 'reason']));
  const decision = body.decision;
  if (decision !== 'approved' && decision !== 'rejected') throw new BadRequestException('Moderation decision is invalid.');
  const reason = optionalText(body.reason, 2000, 'reason');
  if (decision === 'rejected' && (!reason || reason.length < 2)) throw new BadRequestException('A rejection reason is required.');
  if (decision === 'approved' && reason) throw new BadRequestException('Approval cannot carry a rejection reason.');
  return { expectedReviewRevision: positiveInteger(body.expectedReviewRevision, 'expectedReviewRevision'), decision, reason };
}

export function validateAdPublicFilters(filters: { q?: unknown; categoryCode?: unknown; cityCode?: unknown }) {
  const q = optionalText(filters.q, 120, 'q');
  const categoryCode = filters.categoryCode === undefined ? undefined : validateCategoryCode(filters.categoryCode);
  const cityCode = optionalCode(filters.cityCode, 'cityCode');
  return { q, categoryCode, cityCode };
}

function readContent(body: Record<string, unknown>, partial: boolean): AdContentInput | AdContentPatch {
  const out: Record<string, unknown> = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
  const required = (key: string) => !partial || has(key);

  if (required('businessProfileId') && has('businessProfileId')) out.businessProfileId = optionalIdentifier(body.businessProfileId, 'businessProfileId', true);
  if (required('kind')) {
    if (!KINDS.includes(body.kind as AdKind)) throw new BadRequestException(`kind must be one of: ${KINDS.join(', ')}`);
    out.kind = body.kind;
  }
  if (required('titleAr')) out.titleAr = requiredText(body.titleAr, 2, 160, 'titleAr');
  if (has('descriptionAr')) out.descriptionAr = optionalText(body.descriptionAr, 4000, 'descriptionAr');
  if (required('categoryCode')) out.categoryCode = validateCategoryCode(body.categoryCode);
  if (required('priceMode')) {
    if (!PRICE_MODES.includes(body.priceMode as AdPriceMode)) throw new BadRequestException(`priceMode must be one of: ${PRICE_MODES.join(', ')}`);
    out.priceMode = body.priceMode;
  }
  if (has('priceMinor')) out.priceMinor = optionalPositiveInteger(body.priceMinor, 'priceMinor');
  if (has('currency')) {
    if (body.currency === null || body.currency === '') out.currency = undefined;
    else if (!CURRENCIES.includes(body.currency as (typeof CURRENCIES)[number])) throw new BadRequestException('currency must be SYP or USD.');
    else out.currency = body.currency;
  }
  if (has('cityCode')) out.cityCode = optionalCode(body.cityCode, 'cityCode');
  if (has('areaText')) out.areaText = optionalText(body.areaText, 160, 'areaText');
  if (required('contactMode')) {
    if (!CONTACT_MODES.includes(body.contactMode as AdContactMode)) throw new BadRequestException(`contactMode must be one of: ${CONTACT_MODES.join(', ')}`);
    out.contactMode = body.contactMode;
  }
  if (has('contactValue')) out.contactValue = optionalText(body.contactValue, 80, 'contactValue');
  if (has('expiresAt')) out.expiresAt = optionalTimestamp(body.expiresAt);
  return out as AdContentInput | AdContentPatch;
}

function validateContracts(content: AdContentInput | AdContentPatch, partial = false): void {
  if (!partial || content.priceMode !== undefined || content.priceMinor !== undefined || content.currency !== undefined) {
    if (content.priceMode === 'fixed') {
      if (!content.priceMinor || !content.currency) throw new BadRequestException('Fixed-price ad requires priceMinor and currency.');
    } else if (content.priceMode !== undefined && (content.priceMinor !== undefined || content.currency !== undefined)) {
      throw new BadRequestException('Non-fixed ad cannot carry priceMinor or currency.');
    }
  }
  if (!partial || content.contactMode !== undefined || content.contactValue !== undefined) {
    if (content.contactMode === 'profile') {
      if (content.contactValue) throw new BadRequestException('Profile contact cannot carry contactValue.');
    } else if (content.contactMode !== undefined && (!content.contactValue || content.contactValue.length < 6)) {
      throw new BadRequestException('Direct contact requires contactValue.');
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Request body must be an object.');
  return value as Record<string, unknown>;
}

export function rejectUnknown(body: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length) throw new BadRequestException(`Unsupported ad fields: ${unknown.sort().join(', ')}`);
}

function requestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(value)) throw new BadRequestException('clientRequestId is invalid.');
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new BadRequestException(`${field} must be a positive safe integer.`);
  return Number(value);
}

function optionalPositiveInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return positiveInteger(value, field);
}

function requiredText(value: unknown, min: number, max: number, field: string): string {
  if (typeof value !== 'string') throw new BadRequestException(`${field} must be a string.`);
  const text = value.trim();
  if (text.length < min || text.length > max) throw new BadRequestException(`${field} length is invalid.`);
  return text;
}

function optionalText(value: unknown, max: number, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`${field} must be a string.`);
  const text = value.trim();
  if (text.length > max) throw new BadRequestException(`${field} is too long.`);
  return text || undefined;
}

function optionalIdentifier(value: unknown, field: string, allowNull = false): string | null | undefined {
  if (value === undefined || value === '') return undefined;
  if (value === null && allowNull) return null;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) throw new BadRequestException(`${field} is invalid.`);
  return value;
}

function optionalCode(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{1,49}$/.test(value.trim())) throw new BadRequestException(`${field} is invalid.`);
  return value.trim();
}

function optionalTimestamp(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new BadRequestException('expiresAt must include a timezone.');
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new BadRequestException('expiresAt is invalid.');
  return new Date(parsed).toISOString();
}
