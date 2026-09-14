import { BadRequestException } from '@nestjs/common';
import { validateCategoryCode } from '../categories/category.validation';
import { isSyrianCityCode } from '../locations/locations.service';
import type { ProductAvailability, ProductSort, PublicProductFilters } from './product.types';

const text = (value: unknown, field: string, min: number, max: number, optional = false) => {
  if ((value === undefined || value === null || value === '') && optional) return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`${field} must be a string.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new BadRequestException(`${field} is invalid.`);
  return normalized;
};

export function validateProductWrite(value: Record<string, unknown>, partial = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Product request must be an object.');
  const result: Record<string, unknown> = {};
  if (!partial || value.titleAr !== undefined) result.titleAr = text(value.titleAr, 'titleAr', 2, 160);
  if (!partial || value.descriptionAr !== undefined) result.descriptionAr = text(value.descriptionAr, 'descriptionAr', 0, 2000, true) ?? (partial ? null : undefined);
  if (!partial || value.price !== undefined) {
    if ((typeof value.price !== 'number' && typeof value.price !== 'string')
      || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(String(value.price).trim())) {
      throw new BadRequestException('price must be a decimal amount with at most two fraction digits.');
    }
    const price = Number(value.price);
    if (!Number.isFinite(price) || price <= 0 || price > 999999999999) throw new BadRequestException('price is invalid.');
    result.price = price;
  }
  if (!partial || value.currency !== undefined) {
    if (value.currency !== 'SYP' && value.currency !== 'USD') throw new BadRequestException('currency is invalid.');
    result.currency = value.currency;
  }
  if (!partial || value.categoryCode !== undefined) result.categoryCode = validateCategoryCode(value.categoryCode);
  if (!partial || value.availability !== undefined) {
    const allowed: ProductAvailability[] = ['in_stock', 'out_of_stock', 'made_to_order'];
    if (!allowed.includes(value.availability as ProductAvailability)) throw new BadRequestException('availability is invalid.');
    result.availability = value.availability;
  }
  if (!partial || value.businessProfileId !== undefined) result.businessProfileId = text(value.businessProfileId, 'businessProfileId', 1, 100);
  return result as {
    titleAr?: string; descriptionAr?: string | null; price?: number; currency?: 'SYP' | 'USD';
    categoryCode?: string; availability?: ProductAvailability; businessProfileId?: string;
  };
}

export function validateProductPublicFilters(value: Record<string, unknown>): PublicProductFilters {
  const q = optionalQueryText(value.q, 'q', 100);
  const categoryCode = optionalQueryText(value.categoryCode, 'categoryCode', 50);
  const cityCode = optionalQueryText(value.cityCode, 'cityCode', 50);
  const businessProfileId = optionalQueryText(value.businessProfileId, 'businessProfileId', 100);
  const availability = optionalAvailability(value.availability);
  const currency = optionalCurrency(value.currency);
  const minPrice = optionalPrice(value.minPrice, 'minPrice');
  const maxPrice = optionalPrice(value.maxPrice, 'maxPrice');
  const sort = optionalSort(value.sort);

  if (categoryCode) validateCategoryCode(categoryCode);
  if (cityCode && !isSyrianCityCode(cityCode)) throw new BadRequestException('cityCode must identify a supported Syrian city.');
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new BadRequestException('minPrice cannot exceed maxPrice.');
  }
  if ((minPrice !== undefined || maxPrice !== undefined || sort === 'price_asc' || sort === 'price_desc') && !currency) {
    throw new BadRequestException('currency is required for price filtering or sorting.');
  }

  return { q, categoryCode, cityCode, businessProfileId, availability, currency, minPrice, maxPrice, sort };
}

function optionalQueryText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`${field} must be a string.`);
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > max) throw new BadRequestException(`${field} is too long.`);
  return normalized;
}

function optionalAvailability(value: unknown): ProductAvailability | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const allowed: ProductAvailability[] = ['in_stock', 'out_of_stock', 'made_to_order'];
  if (!allowed.includes(value as ProductAvailability)) throw new BadRequestException('availability is invalid.');
  return value as ProductAvailability;
}

function optionalCurrency(value: unknown): 'SYP' | 'USD' | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value !== 'SYP' && value !== 'USD') throw new BadRequestException('currency is invalid.');
  return value;
}

function optionalPrice(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 999999999999) throw new BadRequestException(`${field} is invalid.`);
  return parsed;
}

function optionalSort(value: unknown): ProductSort {
  if (value === undefined || value === null || value === '') return 'newest';
  const allowed: ProductSort[] = ['newest', 'price_asc', 'price_desc'];
  if (!allowed.includes(value as ProductSort)) throw new BadRequestException('sort is invalid.');
  return value as ProductSort;
}
