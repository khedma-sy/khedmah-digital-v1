import { BadRequestException } from "@nestjs/common";
import type { OrderStatus } from "./order.types";
import { normalizeFoodPromoCode } from "./food-promotion.validation";

const statuses: readonly OrderStatus[] = [
  "placed",
  "quoted",
  "merchant_confirmed",
  "courier_assigned",
  "courier_accepted",
  "ready_for_pickup",
  "picked_up",
  "delivered",
  "rejected",
  "cancelled",
];
const text = (value: unknown, field: string, min: number, max: number) => {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    throw new BadRequestException(`${field} is invalid.`);
  return value.trim();
};

function validateItems(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20)
    throw new BadRequestException(
      "items must contain between 1 and 20 products.",
    );
  return value.map((raw) => {
    if (!raw || typeof raw !== "object")
      throw new BadRequestException("order item is invalid.");
    const item = raw as Record<string, unknown>;
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50)
      throw new BadRequestException("quantity must be between 1 and 50.");
    return {
      productListingId: text(item.productListingId, "productListingId", 1, 100),
      quantity,
    };
  });
}

function expectedMoney(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 999_999_999_999.99)
    throw new BadRequestException(`${field} is invalid.`);
  const minor = Math.round(value * 100);
  if (Math.abs(value * 100 - minor) > 1e-7)
    throw new BadRequestException(`${field} is invalid.`);
  return minor / 100;
}

export function validateCreateOrder(value: Record<string, unknown>) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Order payload is invalid.');
  const items = validateItems(value.items);
  const latitude =
    value.deliveryLatitude === undefined
      ? undefined
      : Number(value.deliveryLatitude);
  const longitude =
    value.deliveryLongitude === undefined
      ? undefined
      : Number(value.deliveryLongitude);
  if (
    (latitude === undefined) !== (longitude === undefined) ||
    (latitude !== undefined &&
      (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 ||
        latitude > 90 ||
        longitude! < -180 ||
        longitude! > 180))
  )
    throw new BadRequestException("delivery coordinates are invalid.");
  const promoCode = normalizeFoodPromoCode(value.promoCode);
  const expectedSubtotal = value.expectedSubtotal === undefined
    ? undefined
    : expectedMoney(value.expectedSubtotal, "expectedSubtotal");
  const expectedDiscountAmount = value.expectedDiscountAmount === undefined
    ? undefined
    : expectedMoney(value.expectedDiscountAmount, "expectedDiscountAmount");
  if (promoCode && (expectedSubtotal === undefined || expectedDiscountAmount === undefined))
    throw new BadRequestException("A reviewed food promotion quote is required.");
  if (!promoCode && (expectedSubtotal !== undefined || expectedDiscountAmount !== undefined))
    throw new BadRequestException("Promotion quote expectations require promoCode.");
  return {
    items,
    deliveryAddress: text(value.deliveryAddress, "deliveryAddress", 5, 300),
    customerPhone: text(value.customerPhone, "customerPhone", 6, 30),
    deliveryLatitude: latitude,
    deliveryLongitude: longitude,
    customerNote:
      value.customerNote === undefined
        ? undefined
        : text(value.customerNote, "customerNote", 1, 500),
    prescriptionAttested: value.prescriptionAttested === true,
    promoCode,
    expectedSubtotal,
    expectedDiscountAmount,
  };
}

export function validateOrderQuote(value: Record<string, unknown>) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BadRequestException("Order quote payload is invalid.");
  return {
    items: validateItems(value.items),
    promoCode: normalizeFoodPromoCode(value.promoCode),
  };
}

export function validateOrderAction(value: Record<string, unknown>) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Order action is invalid.');
  if (
    typeof value.status !== "string" ||
    !statuses.includes(value.status as OrderStatus)
  )
    throw new BadRequestException("status is invalid.");
  const deliveryFee =
    value.deliveryFee === undefined ? undefined : Number(value.deliveryFee);
  if (
    deliveryFee !== undefined &&
    (!Number.isFinite(deliveryFee) ||
      deliveryFee < 0 ||
      deliveryFee > 100000000 ||
      Math.abs(deliveryFee * 100 - Math.round(deliveryFee * 100)) > 1e-7)
  )
    throw new BadRequestException("deliveryFee is invalid.");
  return {
    status: value.status as OrderStatus,
    deliveryFee,
    courierBusinessId:
      value.courierBusinessId === undefined
        ? undefined
        : text(value.courierBusinessId, "courierBusinessId", 1, 100),
    expectedCourierBusinessId:
      value.expectedCourierBusinessId === undefined
        ? undefined
        : text(
            value.expectedCourierBusinessId,
            "expectedCourierBusinessId",
            1,
            100,
          ),
    reason:
      value.reason === undefined
        ? undefined
        : text(value.reason, "reason", 2, 300),
    pharmacyApproved: value.pharmacyApproved === true,
  };
}

export function validateIdempotency(value: unknown) {
  return text(value, "Idempotency-Key", 16, 128);
}
