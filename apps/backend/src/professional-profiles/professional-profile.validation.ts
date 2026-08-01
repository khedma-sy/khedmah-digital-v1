import { BadRequestException } from '@nestjs/common';
import { CreateProfessionalProfileRequest, SearchProfessionalProfilesRequest, UpdateProfessionalProfileRequest } from './dto/professional-profile.dto';
import { ProfessionalAvailability } from './professional-profile.types';

function requiredString(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new BadRequestException(`${field} must be between ${min} and ${max} characters.`);
  }
  return normalized;
}

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

function validateAvailability(value: unknown): ProfessionalAvailability {
  if (value === 'available' || value === 'busy' || value === 'unavailable') {
    return value;
  }
  throw new BadRequestException("availability must be one of 'available', 'busy', or 'unavailable'.");
}

function validateSkills(value: unknown): readonly string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new BadRequestException('skills must be an array of strings.');
  }
  if (value.length > 20) {
    throw new BadRequestException('skills must contain at most 20 items.');
  }
  return value.map((item, index) => {
    if (typeof item !== 'string') {
      throw new BadRequestException(`skills[${index}] must be a string.`);
    }
    const normalized = item.trim();
    if (normalized.length === 0 || normalized.length > 50) {
      throw new BadRequestException(`skills[${index}] must be between 1 and 50 characters.`);
    }
    return normalized;
  });
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

export function validateProfessionalProfileUpsert(request: CreateProfessionalProfileRequest | UpdateProfessionalProfileRequest) {
  return {
    headlineAr: requiredString(request.headlineAr, 'headlineAr', 2, 200),
    headlineEn: optionalString(request.headlineEn, 'headlineEn', 200),
    bioAr: optionalString(request.bioAr, 'bioAr', 2000),
    bioEn: optionalString(request.bioEn, 'bioEn', 2000),
    availability: request.availability === undefined ? 'available' as const : validateAvailability(request.availability),
    cityCode: requiredString(request.cityCode, 'cityCode', 2, 50),
    countryCode: requiredString(request.countryCode, 'countryCode', 2, 10),
    skills: validateSkills(request.skills)
  };
}

export function validateProfessionalProfileSearch(request: SearchProfessionalProfilesRequest) {
  return {
    q: request.q === undefined ? undefined : optionalString(request.q, 'q', 200),
    cityCode: request.cityCode === undefined ? undefined : optionalString(request.cityCode, 'cityCode', 50),
    availability: request.availability === undefined ? undefined : validateAvailability(request.availability),
    page: validatePage(request.page)
  };
}
