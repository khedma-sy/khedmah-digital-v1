import { BadRequestException } from '@nestjs/common';
import { validateCategoryCode } from '../categories/category.validation';
import type { ProductAvailability } from './product.types';

const text = (value: unknown, field: string, min: number, max: number, optional = false) => {
  if ((value === undefined || value === null || value === '') && optional) return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`${field} must be a string.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new BadRequestException(`${field} is invalid.`);
  return normalized;
};

export function validateProductWrite(value: Record<string, unknown>, partial = false) {
  const result: Record<string, unknown> = {};
  if (!partial || value.titleAr !== undefined) result.titleAr = text(value.titleAr, 'titleAr', 2, 160);
  if (!partial || value.descriptionAr !== undefined) result.descriptionAr = text(value.descriptionAr, 'descriptionAr', 0, 2000, true);
  if (!partial || value.price !== undefined) {
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
  if (!partial || value.requiresPrescription !== undefined) result.requiresPrescription = value.requiresPrescription === true;
  if (!partial || value.controlledItem !== undefined) result.controlledItem = value.controlledItem === true;
  return result as {
    titleAr?: string; descriptionAr?: string; price?: number; currency?: 'SYP' | 'USD';
    categoryCode?: string; availability?: ProductAvailability; businessProfileId?: string; requiresPrescription?: boolean; controlledItem?: boolean;
  };
}
