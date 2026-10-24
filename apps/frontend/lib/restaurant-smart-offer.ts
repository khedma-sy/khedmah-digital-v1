export type SmartRestaurantOfferKind = 'percentage' | 'fixed';

export interface SmartRestaurantOfferInput {
  businessId: string;
  code: string;
  nameAr: string;
  currency: 'SYP' | 'USD';
  kind: SmartRestaurantOfferKind;
  percentageOff?: number;
  fixedAmount?: number;
  minimumSubtotal: number;
  maximumDiscount?: number;
  validFrom: string;
  validUntil: string;
  maxRedemptions?: number;
  perUserLimit?: number;
}

export interface SmartRestaurantOfferDraft {
  businessId: string;
  code: string;
  nameAr: string;
  discountType: SmartRestaurantOfferKind;
  percentageOff?: number;
  fixedAmount?: number;
  currency: 'SYP' | 'USD';
  minimumSubtotal: number;
  maximumDiscount?: number;
  validFrom: string;
  validUntil: string;
  maxRedemptions?: number;
  perUserLimit: number;
  smartReview: {
    autoPublishEligible: boolean;
    requiresOwnerConfirmation: boolean;
    reasons: string[];
  };
}

function nonEmpty(value: string, field: string, min: number, max: number): string {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new Error(field + ' is invalid.');
  return normalized;
}

function finiteMoney(value: number | undefined, field: string, allowZero = false): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < (allowZero ? 0 : 0.01) || value > 100_000_000) {
    throw new Error(field + ' is invalid.');
  }
  return Math.round(value * 100) / 100;
}

export function buildSmartRestaurantOfferDraft(input: SmartRestaurantOfferInput): SmartRestaurantOfferDraft {
  const businessId = nonEmpty(input.businessId, 'businessId', 1, 120);
  const code = nonEmpty(input.code.toUpperCase(), 'code', 4, 32);
  if (!/^[A-Z0-9_-]+$/.test(code)) throw new Error('code is invalid.');
  const nameAr = nonEmpty(input.nameAr, 'nameAr', 2, 100);

  const from = new Date(input.validFrom);
  const until = new Date(input.validUntil);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(until.getTime()) || until <= from) {
    throw new Error('Offer dates are invalid.');
  }
  const durationHours = (until.getTime() - from.getTime()) / 3_600_000;
  if (durationHours > 24 * 31) throw new Error('Offer duration is too long.');

  const minimumSubtotal = finiteMoney(input.minimumSubtotal, 'minimumSubtotal', true)!;
  const percentageOff = input.kind === 'percentage' ? input.percentageOff : undefined;
  const fixedAmount = input.kind === 'fixed' ? finiteMoney(input.fixedAmount, 'fixedAmount') : undefined;
  const maximumDiscount = finiteMoney(input.maximumDiscount, 'maximumDiscount');

  if (input.kind === 'percentage') {
    if (!Number.isInteger(percentageOff) || Number(percentageOff) < 1 || Number(percentageOff) > 90) {
      throw new Error('percentageOff is invalid.');
    }
    if (input.fixedAmount !== undefined) throw new Error('fixedAmount is not allowed for percentage offers.');
  } else {
    if (fixedAmount === undefined) throw new Error('fixedAmount is required.');
    if (minimumSubtotal <= fixedAmount) throw new Error('minimumSubtotal must be greater than fixedAmount.');
    if (input.percentageOff !== undefined) throw new Error('percentageOff is not allowed for fixed offers.');
    if (maximumDiscount !== undefined) throw new Error('maximumDiscount is not allowed for fixed offers.');
  }

  const maxRedemptions = input.maxRedemptions;
  if (maxRedemptions !== undefined && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 1_000_000)) {
    throw new Error('maxRedemptions is invalid.');
  }
  const perUserLimit = input.perUserLimit ?? 1;
  if (!Number.isInteger(perUserLimit) || perUserLimit < 1 || perUserLimit > 20) throw new Error('perUserLimit is invalid.');
  if (maxRedemptions !== undefined && maxRedemptions < perUserLimit) throw new Error('maxRedemptions is below perUserLimit.');

  const reasons: string[] = [];
  if (input.kind === 'percentage' && Number(percentageOff) > 40) reasons.push('خصم أكبر من 40% يحتاج تأكيد صاحب المطعم.');
  if (durationHours > 24 * 7) reasons.push('العرض أطول من 7 أيام.');
  if (perUserLimit > 3) reasons.push('حد الاستخدام لكل عميل أكبر من 3 مرات.');
  if (maxRedemptions === undefined) reasons.push('لا يوجد سقف إجمالي لعدد مرات الاستخدام.');

  return {
    businessId,
    code,
    nameAr,
    discountType: input.kind,
    percentageOff: input.kind === 'percentage' ? Number(percentageOff) : undefined,
    fixedAmount,
    currency: input.currency,
    minimumSubtotal,
    maximumDiscount,
    validFrom: from.toISOString(),
    validUntil: until.toISOString(),
    maxRedemptions,
    perUserLimit,
    smartReview: {
      autoPublishEligible: reasons.length === 0,
      requiresOwnerConfirmation: reasons.length > 0,
      reasons,
    },
  };
}
