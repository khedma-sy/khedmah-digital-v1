import { BadRequestException } from '@nestjs/common';
import { PublicSearchRequest } from './dto/search.dto';

export type PublicSearchType = 'business' | 'service' | 'all';

function optionalString(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return undefined;
  }
  if (normalized.length > max) {
    throw new BadRequestException(`${field} must be at most ${max} characters.`);
  }
  return normalized;
}

function validatePage(value: unknown): number {
  if (value === undefined) {
    return 1;
  }
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException('page must be a positive integer.');
  }
  return parsed;
}

function validateType(value: unknown): PublicSearchType {
  if (value === undefined) {
    return 'all';
  }
  if (value === 'business' || value === 'service' || value === 'all') {
    return value;
  }
  throw new BadRequestException("type must be one of 'business', 'service', or 'all'.");
}

export function validatePublicSearchRequest(request: PublicSearchRequest) {
  return {
    q: optionalString(request.q, 'q', 200),
    categoryCode: optionalString(request.categoryCode, 'categoryCode', 50),
    cityCode: optionalString(request.cityCode, 'cityCode', 50),
    page: validatePage(request.page),
    type: validateType(request.type)
  };
}
