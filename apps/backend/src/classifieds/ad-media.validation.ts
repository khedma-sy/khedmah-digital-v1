import { BadRequestException } from '@nestjs/common';

export type AdImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ValidatedAdImageUpload {
  readonly clientRequestId: string;
  readonly expectedContentRevision: number;
  readonly filename: string;
  readonly mimeType: AdImageMimeType;
  readonly sizeBytes: number;
  readonly content: string;
  readonly sortOrder: number;
}

export interface ValidatedAdImageDelete {
  readonly clientRequestId: string;
  readonly expectedContentRevision: number;
}

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const MIMES: readonly AdImageMimeType[] = ['image/jpeg', 'image/png', 'image/webp'];

export function validateAdImageUpload(value: unknown): ValidatedAdImageUpload {
  const body = asRecord(value);
  rejectUnknown(body, new Set(['clientRequestId', 'expectedContentRevision', 'filename', 'mimeType', 'sizeBytes', 'content', 'sortOrder']));
  const filename = requiredText(body.filename, 1, 255, 'filename');
  if (!MIMES.includes(body.mimeType as AdImageMimeType)) throw new BadRequestException(`mimeType must be one of: ${MIMES.join(', ')}`);
  if (!Number.isSafeInteger(body.sizeBytes) || Number(body.sizeBytes) < 1 || Number(body.sizeBytes) > MAX_SIZE_BYTES) {
    throw new BadRequestException(`sizeBytes must be between 1 and ${MAX_SIZE_BYTES} bytes.`);
  }
  if (typeof body.content !== 'string' || body.content.length === 0) throw new BadRequestException('content (base64) is required.');
  const sortOrder = body.sortOrder === undefined ? 0 : body.sortOrder;
  if (!Number.isSafeInteger(sortOrder) || Number(sortOrder) < 0 || Number(sortOrder) > 1000) {
    throw new BadRequestException('sortOrder must be an integer between 0 and 1000.');
  }
  return {
    clientRequestId: requestId(body.clientRequestId),
    expectedContentRevision: positiveInteger(body.expectedContentRevision, 'expectedContentRevision'),
    filename,
    mimeType: body.mimeType as AdImageMimeType,
    sizeBytes: Number(body.sizeBytes),
    content: body.content,
    sortOrder: Number(sortOrder)
  };
}

export function validateAdImageDelete(value: unknown): ValidatedAdImageDelete {
  const body = asRecord(value);
  rejectUnknown(body, new Set(['clientRequestId', 'expectedContentRevision']));
  return {
    clientRequestId: requestId(body.clientRequestId),
    expectedContentRevision: positiveInteger(body.expectedContentRevision, 'expectedContentRevision')
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Request body must be an object.');
  return value as Record<string, unknown>;
}

function rejectUnknown(body: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length) throw new BadRequestException(`Unsupported ad image fields: ${unknown.sort().join(', ')}`);
}

function requestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(value)) throw new BadRequestException('clientRequestId is invalid.');
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new BadRequestException(`${field} must be a positive safe integer.`);
  return Number(value);
}

function requiredText(value: unknown, min: number, max: number, field: string): string {
  if (typeof value !== 'string') throw new BadRequestException(`${field} must be a string.`);
  const text = value.trim();
  if (text.length < min || text.length > max) throw new BadRequestException(`${field} length is invalid.`);
  return text;
}
