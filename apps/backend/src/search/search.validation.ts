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
  const map = request.map === 'true' || request.map === true;
  const coordinates = [request.latitude, request.longitude].map((value) => value === undefined ? undefined : Number(value));
  if (coordinates.some((value) => value !== undefined && !Number.isFinite(value))) {
    throw new BadRequestException('latitude and longitude must be valid numbers.');
  }
  if ((coordinates[0] !== undefined && Math.abs(coordinates[0]) > 90) || (coordinates[1] !== undefined && Math.abs(coordinates[1]) > 180)) {
    throw new BadRequestException('latitude or longitude is outside the geographic coordinate range.');
  }
  let boundaries: { south: number; west: number; north: number; east: number } | undefined;
  const individualBounds = [request.south, request.west, request.north, request.east];
  if (individualBounds.some((value) => value !== undefined)) {
    const parts = individualBounds.map(Number);
    if (parts.some((part) => !Number.isFinite(part)) || Math.abs(parts[0]) > 90 || Math.abs(parts[2]) > 90 || Math.abs(parts[1]) > 180 || Math.abs(parts[3]) > 180 || parts[0] >= parts[2] || parts[1] >= parts[3]) {
      throw new BadRequestException('south, west, north, and east must define valid map boundaries.');
    }
    boundaries = { south: parts[0], west: parts[1], north: parts[2], east: parts[3] };
  } else if (request.boundaries !== undefined) {
    const raw = String(request.boundaries);
    const parts = raw.includes(',') ? raw.split(',').map(Number) : raw.split('-').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part)) || Math.abs(parts[0]) > 90 || Math.abs(parts[2]) > 90 || Math.abs(parts[1]) > 180 || Math.abs(parts[3]) > 180 || parts[0] >= parts[2] || parts[1] >= parts[3]) {
      throw new BadRequestException('boundaries must use south-west-north-east with valid map coordinates.');
    }
    boundaries = { south: parts[0], west: parts[1], north: parts[2], east: parts[3] };
  }
  return {
    q: optionalString(request.q, 'q', 200),
    categoryCode: optionalString(request.categoryCode, 'categoryCode', 50),
    cityCode: optionalString(request.cityCode, 'cityCode', 50),
    page: validatePage(request.page),
    type: validateType(request.type), map, boundaries,
    latitude: coordinates[0], longitude: coordinates[1]
  };
}
