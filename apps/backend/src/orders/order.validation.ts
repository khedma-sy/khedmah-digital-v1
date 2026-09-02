import { BadRequestException } from "@nestjs/common";
import type { OrderStatus } from "./order.types";

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

export function validateCreateOrder(value: Record<string, unknown>) {
  if (
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > 20
  )
    throw new BadRequestException(
      "items must contain between 1 and 20 products.",
    );
  const items = value.items.map((raw) => {
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
      (latitude < -90 ||
        latitude > 90 ||
        longitude! < -180 ||
        longitude! > 180))
  )
    throw new BadRequestException("delivery coordinates are invalid.");
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
  };
}

export function validateOrderAction(value: Record<string, unknown>) {
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
      deliveryFee > 100000000)
  )
    throw new BadRequestException("deliveryFee is invalid.");
  return {
    status: value.status as OrderStatus,
    deliveryFee,
    courierBusinessId:
      value.courierBusinessId === undefined
        ? undefined
        : text(value.courierBusinessId, "courierBusinessId", 1, 100),
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
