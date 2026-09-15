import { BadRequestException } from "@nestjs/common";

const MAX_MONEY = 999_999_999_999.99;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BadRequestException("Food promotion payload is invalid.");
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== "string")
    throw new BadRequestException(`${field} is invalid.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max)
    throw new BadRequestException(`${field} is invalid.`);
  return normalized;
}

export function normalizeFoodPromoCode(value: unknown, optional = true) {
  if (optional && (value === undefined || value === null || value === ""))
    return undefined;
  const code = text(value, "promoCode", 4, 32).toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(code))
    throw new BadRequestException("promoCode is invalid.");
  return code;
}

function money(value: unknown, field: string, options: { positive?: boolean } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_MONEY)
    throw new BadRequestException(`${field} is invalid.`);
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 1e-7 || (options.positive && cents === 0))
    throw new BadRequestException(`${field} is invalid.`);
  return cents / 100;
}

function positiveInteger(value: unknown, field: string, maximum: number) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > maximum)
    throw new BadRequestException(`${field} is invalid.`);
  return result;
}

function timestamp(value: unknown, field: string) {
  const raw = text(value, field, 20, 40);
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime()))
    throw new BadRequestException(`${field} is invalid.`);
  return date;
}

export function validateCreateFoodPromotion(value: unknown) {
  const body = object(value);
  if (body.discountType !== "percentage" && body.discountType !== "fixed")
    throw new BadRequestException("discountType is invalid.");
  const discountType: "percentage" | "fixed" = body.discountType;
  if (body.currency !== "SYP" && body.currency !== "USD")
    throw new BadRequestException("currency is invalid.");
  const currency: "SYP" | "USD" = body.currency;
  const minimumSubtotal = money(body.minimumSubtotal ?? 0, "minimumSubtotal");
  const percentageOff = discountType === "percentage"
    ? positiveInteger(body.percentageOff, "percentageOff", 90)
    : undefined;
  const fixedAmount = discountType === "fixed"
    ? money(body.fixedAmount, "fixedAmount", { positive: true })
    : undefined;
  const maximumDiscount = body.maximumDiscount === undefined || body.maximumDiscount === null
    ? undefined
    : money(body.maximumDiscount, "maximumDiscount", { positive: true });
  if (discountType === "fixed" && maximumDiscount !== undefined)
    throw new BadRequestException("maximumDiscount is available only for percentage promotions.");
  if (fixedAmount !== undefined && minimumSubtotal <= fixedAmount)
    throw new BadRequestException("minimumSubtotal must be greater than fixedAmount.");
  const validFrom = timestamp(body.validFrom, "validFrom");
  const validUntil = timestamp(body.validUntil, "validUntil");
  if (validUntil <= validFrom || validUntil <= new Date())
    throw new BadRequestException("validUntil is invalid.");
  const perUserLimit = positiveInteger(body.perUserLimit ?? 1, "perUserLimit", 20);
  const maxRedemptions = body.maxRedemptions === undefined || body.maxRedemptions === null
    ? undefined
    : positiveInteger(body.maxRedemptions, "maxRedemptions", 10_000_000);
  if (maxRedemptions !== undefined && maxRedemptions < perUserLimit)
    throw new BadRequestException("maxRedemptions cannot be lower than perUserLimit.");
  return {
    businessId: text(body.businessId, "businessId", 1, 100),
    code: normalizeFoodPromoCode(body.code, false)!,
    nameAr: text(body.nameAr, "nameAr", 2, 100),
    discountType,
    percentageOff,
    fixedAmount,
    currency,
    minimumSubtotal,
    maximumDiscount,
    validFrom: validFrom.toISOString(),
    validUntil: validUntil.toISOString(),
    maxRedemptions,
    perUserLimit,
  };
}

export function validateFoodPromotionStatus(value: unknown) {
  const body = object(value);
  if (typeof body.active !== "boolean")
    throw new BadRequestException("active is invalid.");
  const expectedUpdatedAt = timestamp(body.expectedUpdatedAt, "expectedUpdatedAt").toISOString();
  return { active: body.active, expectedUpdatedAt };
}
