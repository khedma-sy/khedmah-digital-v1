import { BadRequestException } from "@nestjs/common";

// fulfillment_orders and fulfillment_order_items store money as NUMERIC(14,2).
// Keep multiplication, summation and the range check in integer cents.
const maximumCents = 99_999_999_999_999n;

function bounded(cents: bigint, field: string): bigint {
  if (cents < 0n || cents > maximumCents)
    throw new BadRequestException(`${field} exceeds the supported cash order amount range.`);
  return cents;
}

export function orderMoneyCents(value: string | number, field: string): bigint {
  const decimal = /^(0|[1-9]\d{0,11})(?:\.(\d{1,2}))?$/.exec(String(value).trim());
  if (decimal) {
    return bounded(BigInt(decimal[1]!) * 100n + BigInt((decimal[2] ?? "").padEnd(2, "0")), field);
  }
  // Preserve the existing tolerance for numeric inputs such as 0.1 + 0.2.
  // Database decimal strings use the exact path above, never floating arithmetic.
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    const scaled = value * 100, cents = Math.round(scaled);
    if (Number.isSafeInteger(cents) && Math.abs(scaled - cents) <= 1e-7)
      return bounded(BigInt(cents), field);
  }
  throw new BadRequestException(`${field} is invalid.`);
}

export function orderSubtotal(items: readonly { unitPrice: string | number; quantity: number }[]): number {
  let subtotal = 0n;
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50)
      throw new BadRequestException("quantity must be between 1 and 50.");
    const price = orderMoneyCents(item.unitPrice, "unitPrice");
    if (price === 0n) throw new BadRequestException("unitPrice must be greater than zero.");
    const line = bounded(price * BigInt(item.quantity), "lineTotal");
    subtotal = bounded(subtotal + line, "subtotal");
  }
  if (subtotal === 0n) throw new BadRequestException("subtotal must be greater than zero.");
  return Number(subtotal) / 100;
}

export function orderTotal(subtotal: string | number, discount: string | number, fee: string | number): number {
  const subtotalCents = orderMoneyCents(subtotal, "subtotal");
  const discountCents = orderMoneyCents(discount, "discountAmount");
  const feeCents = orderMoneyCents(fee, "deliveryFee");
  if (subtotalCents === 0n || discountCents >= subtotalCents)
    throw new BadRequestException("The discounted subtotal must be greater than zero.");
  return Number(bounded(subtotalCents - discountCents + feeCents, "total")) / 100;
}
