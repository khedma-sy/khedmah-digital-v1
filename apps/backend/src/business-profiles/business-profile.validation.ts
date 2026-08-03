import { BadRequestException } from '@nestjs/common';
import { CreateBusinessProfileRequest, SearchBusinessProfilesRequest, UpdateBusinessProfileRequest, UpdateTrustStatusRequest } from './dto/business-profile.dto';
import { BusinessProfileTrustStatus, BusinessProfileVisibility } from './business-profile.types';

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

function optionalEmail(value: unknown): string | undefined {
  const email = optionalString(value, 'email', 200);
  if (!email) {
    return undefined;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestException('email must be a valid email address.');
  }

  return email;
}

function visibility(value: unknown): BusinessProfileVisibility {
  if (value === 'public' || value === 'private') {
    return value;
  }

  throw new BadRequestException("visibility must be either 'public' or 'private'.");
}

function trustStatus(value: unknown): BusinessProfileTrustStatus {
  if (value === 'pending' || value === 'approved' || value === 'suspended') {
    return value;
  }

  throw new BadRequestException("trustStatus must be one of 'pending', 'approved', or 'suspended'.");
}

function optionalCode(value: unknown, field: string, max: number): string | undefined {
  return optionalString(value, field, max);
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

export function validateCreateBusinessProfile(request: CreateBusinessProfileRequest) {
  return {
    name: requiredString(request.name, 'name', 2, 200),
    descriptionAr: optionalString(request.descriptionAr, 'descriptionAr', 2000),
    descriptionEn: optionalString(request.descriptionEn, 'descriptionEn', 2000),
    phone: optionalString(request.phone, 'phone', 30),
    email: optionalEmail(request.email),
    website: optionalString(request.website, 'website', 500),
    categoryCode: requiredString(request.categoryCode, 'categoryCode', 2, 50),
    cityCode: requiredString(request.cityCode, 'cityCode', 2, 50),
    countryCode: requiredString(request.countryCode, 'countryCode', 2, 10)
  };
}

export function validateUpdateBusinessProfile(request: UpdateBusinessProfileRequest) {
  const payload = {
    name: request.name === undefined ? undefined : requiredString(request.name, 'name', 2, 200),
    descriptionAr: request.descriptionAr === undefined ? undefined : optionalString(request.descriptionAr, 'descriptionAr', 2000),
    descriptionEn: request.descriptionEn === undefined ? undefined : optionalString(request.descriptionEn, 'descriptionEn', 2000),
    phone: request.phone === undefined ? undefined : optionalString(request.phone, 'phone', 30),
    email: request.email === undefined ? undefined : optionalEmail(request.email),
    website: request.website === undefined ? undefined : optionalString(request.website, 'website', 500),
    visibility: request.visibility === undefined ? undefined : visibility(request.visibility),
    categoryCode: request.categoryCode === undefined ? undefined : requiredString(request.categoryCode, 'categoryCode', 2, 50),
    cityCode: request.cityCode === undefined ? undefined : requiredString(request.cityCode, 'cityCode', 2, 50),
    countryCode: request.countryCode === undefined ? undefined : requiredString(request.countryCode, 'countryCode', 2, 10)
  };

  if (Object.values(payload).every((value) => value === undefined)) {
    throw new BadRequestException('At least one business profile field must be provided.');
  }

  return payload;
}

export function validateUpdateTrustStatus(request: UpdateTrustStatusRequest) {
  return { trustStatus: trustStatus(request.trustStatus) };
}

export function validateBusinessProfileSearch(request: SearchBusinessProfilesRequest) {
  return {
    q: optionalCode(request.q, 'q', 200),
    categoryCode: optionalCode(request.categoryCode, 'categoryCode', 50),
    cityCode: optionalCode(request.cityCode, 'cityCode', 50),
    page: validatePage(request.page)
  };
}
