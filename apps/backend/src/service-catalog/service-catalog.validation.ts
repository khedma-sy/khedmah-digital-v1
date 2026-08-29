import { BadRequestException } from '@nestjs/common';
import { isSyrianCityCode } from '../locations/locations.service';
import { CreateServiceRequest, ListOwnerServicesRequest, SearchServicesRequest, UpdateServiceRequest } from './dto/service-catalog.dto';
import { ServiceOwnerType, ServicePriceCurrency, ServicePriceType, ServiceStatus } from './service-catalog.types';

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

function validateOwnerType(value: unknown): ServiceOwnerType {
  if (value === 'business' || value === 'professional') {
    return value;
  }
  throw new BadRequestException("ownerType must be either 'business' or 'professional'.");
}

function validateCurrency(value: unknown): ServicePriceCurrency {
  if (value === 'SYP' || value === 'USD' || value === 'EUR') {
    return value;
  }
  throw new BadRequestException("priceCurrency must be one of 'SYP', 'USD', or 'EUR'.");
}

function validatePriceType(value: unknown): ServicePriceType {
  if (value === 'fixed' || value === 'hourly' || value === 'negotiable') {
    return value;
  }
  throw new BadRequestException("priceType must be one of 'fixed', 'hourly', or 'negotiable'.");
}

function validateStatus(value: unknown): ServiceStatus {
  if (value === 'active' || value === 'inactive') {
    return value;
  }
  throw new BadRequestException("status must be either 'active' or 'inactive'.");
}

function validatePositiveNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestException('price must be a positive number.');
  }
  return value;
}

function validateIdentifier(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 128) {
    throw new BadRequestException(`${field} must be a non-empty identifier with at most 128 characters.`);
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

export function validateCreateServiceRequest(request: CreateServiceRequest) {
  return {
    titleAr: requiredString(request.titleAr, 'titleAr', 2, 200),
    titleEn: optionalString(request.titleEn, 'titleEn', 200),
    descriptionAr: optionalString(request.descriptionAr, 'descriptionAr', 2000),
    descriptionEn: optionalString(request.descriptionEn, 'descriptionEn', 2000),
    categoryCode: requiredString(request.categoryCode, 'categoryCode', 2, 50),
    price: validatePositiveNumber(request.price),
    priceCurrency: request.priceCurrency === undefined ? 'SYP' as const : validateCurrency(request.priceCurrency),
    priceType: request.priceType === undefined ? 'negotiable' as const : validatePriceType(request.priceType),
    ownerId: validateIdentifier(request.ownerId, 'ownerId'),
    ownerType: validateOwnerType(request.ownerType),
    ownerUserId: validateIdentifier(request.ownerUserId, 'ownerUserId')
  };
}

export function validateUpdateServiceRequest(request: UpdateServiceRequest) {
  const payload = {
    titleAr: request.titleAr === undefined ? undefined : requiredString(request.titleAr, 'titleAr', 2, 200),
    titleEn: request.titleEn === undefined ? undefined : optionalString(request.titleEn, 'titleEn', 200),
    descriptionAr: request.descriptionAr === undefined ? undefined : optionalString(request.descriptionAr, 'descriptionAr', 2000),
    descriptionEn: request.descriptionEn === undefined ? undefined : optionalString(request.descriptionEn, 'descriptionEn', 2000),
    categoryCode: request.categoryCode === undefined ? undefined : requiredString(request.categoryCode, 'categoryCode', 2, 50),
    price: request.price === undefined ? undefined : validatePositiveNumber(request.price),
    priceCurrency: request.priceCurrency === undefined ? undefined : validateCurrency(request.priceCurrency),
    priceType: request.priceType === undefined ? undefined : validatePriceType(request.priceType),
    status: request.status === undefined ? undefined : validateStatus(request.status)
  };

  if (Object.values(payload).every((value) => value === undefined)) {
    throw new BadRequestException('At least one service field must be provided.');
  }

  return payload;
}

export function validateServiceSearchRequest(request: SearchServicesRequest) {
  const cityCode = request.cityCode === undefined ? undefined : optionalString(request.cityCode, 'cityCode', 50);
  if (cityCode && !isSyrianCityCode(cityCode)) {
    throw new BadRequestException('cityCode must identify a supported Syrian city.');
  }
  return {
    q: request.q === undefined ? undefined : optionalString(request.q, 'q', 200),
    categoryCode: request.categoryCode === undefined ? undefined : optionalString(request.categoryCode, 'categoryCode', 50),
    cityCode,
    page: validatePage(request.page)
  };
}

export function validateOwnerServicesRequest(request: ListOwnerServicesRequest) {
  return { ownerType: validateOwnerType(request.ownerType) };
}
