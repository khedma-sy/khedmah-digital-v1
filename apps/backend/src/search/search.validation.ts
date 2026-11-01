import { BadRequestException } from '@nestjs/common';
import { PublicSearchRequest } from './dto/search.dto';
import { isSyrianCityCode } from '../locations/locations.service';

export type PublicSearchType = 'business' | 'service' | 'all';

function optionalString(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException(field + ' must be a string.');
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return undefined;
  }
  if (normalized.length > max) {
    throw new BadRequestException(field + ' must be at most ' + max + ' characters.');
  }
  return normalized;
}

function validatePage(value: unknown): number {
  if (value === undefined) return 1;
  const parsed = typeof value === 'number' ? value
    : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || !Number.isSafeInteger((parsed - 1) * 20)) {
    throw new BadRequestException('page must be a positive integer with a safe pagination offset.');
  }
  return parsed;
}

function parseFiniteNumber(value: unknown, field: string): number {
  let parsed: number;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string') {
    const normalized = value.trim();
    if (!/^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/.test(normalized)) {
      throw new BadRequestException(field + ' must be a valid number.');
    }
    parsed = Number(normalized);
  } else {
    throw new BadRequestException(field + ' must be a valid number.');
  }
  if (!Number.isFinite(parsed)) {
    throw new BadRequestException(field + ' must be a valid number.');
  }
  return parsed;
}

function optionalFiniteNumber(value: unknown, field: string): number | undefined {
  return value === undefined ? undefined : parseFiniteNumber(value, field);
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

function optionalCityCode(value: unknown): string | undefined {
  const cityCode = optionalString(value, 'cityCode', 50);
  if (cityCode && !isSyrianCityCode(cityCode)) throw new BadRequestException('cityCode must identify a supported Syrian city.');
  return cityCode;
}

function parseHyphenSeparatedBoundaries(raw: string): string[] {
  const match = raw.match(/^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*-\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*-\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*-\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*$/);
  if (!match) {
    throw new BadRequestException('boundaries must use south-west-north-east with valid map coordinates.');
  }
  return match.slice(1);
}

export function validatePublicSearchRequest(request: PublicSearchRequest) {
  const map = request.map === 'true' || request.map === true;
  const latitude = optionalFiniteNumber(request.latitude, 'latitude');
  const longitude = optionalFiniteNumber(request.longitude, 'longitude');
  if ((latitude !== undefined && Math.abs(latitude) > 90) || (longitude !== undefined && Math.abs(longitude) > 180)) {
    throw new BadRequestException('latitude or longitude is outside the geographic coordinate range.');
  }
  let boundaries: { south: number; west: number; north: number; east: number } | undefined;
  const individualBounds = [request.south, request.west, request.north, request.east];
  if (individualBounds.some((value) => value !== undefined)) {
    const parts = [
      parseFiniteNumber(request.south, 'south'),
      parseFiniteNumber(request.west, 'west'),
      parseFiniteNumber(request.north, 'north'),
      parseFiniteNumber(request.east, 'east')
    ];
    if (Math.abs(parts[0]) > 90 || Math.abs(parts[2]) > 90 || Math.abs(parts[1]) > 180 || Math.abs(parts[3]) > 180 || parts[0] >= parts[2] || parts[1] >= parts[3]) {
      throw new BadRequestException('south, west, north, and east must define valid map boundaries.');
    }
    boundaries = { south: parts[0], west: parts[1], north: parts[2], east: parts[3] };
  } else if (request.boundaries !== undefined) {
    const raw = String(request.boundaries);
    const rawParts = raw.includes(',') ? raw.split(',') : parseHyphenSeparatedBoundaries(raw);
    if (rawParts.length !== 4) {
      throw new BadRequestException('boundaries must use south-west-north-east with valid map coordinates.');
    }
    const parts = rawParts.map((part, index) => parseFiniteNumber(part, 'boundaries[' + index + ']'));
    if (Math.abs(parts[0]) > 90 || Math.abs(parts[2]) > 90 || Math.abs(parts[1]) > 180 || Math.abs(parts[3]) > 180 || parts[0] >= parts[2] || parts[1] >= parts[3]) {
      throw new BadRequestException('boundaries must use south-west-north-east with valid map coordinates.');
    }
    boundaries = { south: parts[0], west: parts[1], north: parts[2], east: parts[3] };
  }
  return {
    q: optionalString(request.q, 'q', 200),
    categoryCode: optionalString(request.categoryCode, 'categoryCode', 50),
    cityCode: optionalCityCode(request.cityCode),
    page: validatePage(request.page),
    type: validateType(request.type), map, boundaries,
    latitude, longitude
  };
}
