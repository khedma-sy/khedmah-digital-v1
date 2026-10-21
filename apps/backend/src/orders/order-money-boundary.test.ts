import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { validateProductWrite } from "../products/product.validation";
import { orderMoneyCents, orderSubtotal, orderTotal } from "./order-money";
import { OrderRepository } from "./order.repository";
import { OrderService } from "./order.service";
import type { FulfillmentOrder } from "./order.types";
import { validateOrderQuote } from "./order.validation";

const maximum = 999_999_999_999.99;
const maximumProductPrice = 999_999_999_999;

function isBadRequest(error: unknown): boolean {
  assert.ok(error instanceof BadRequestException);
  assert.equal(error.getStatus(), 400);
  return true;
}

function product(id: string, price: string) {
  return {
    id, business_profile_id: "merchant-1", owner_user_id: "merchant-owner",
    business_name: "مطعم", business_category_code: "restaurant", title_ar: id,
    price, currency: "USD", availability: "in_stock", status: "active",
    moderation_status: "approved", requires_prescription: false, controlled_item: false,
  };
}

function order(overrides: Partial<FulfillmentOrder> = {}): FulfillmentOrder {
  return {
    id: "order-1", customerUserId: "customer-1", merchantBusinessId: "merchant-1",
    merchantOwnerUserId: "merchant-owner", merchantName: "مطعم", vertical: "food",
    status: "placed", paymentMethod: "cash", paymentStatus: "pending", currency: "USD",
    subtotal: 10, discountAmount: 0, deliveryAddress: "دمشق المزة", customerPhone: "0999999999",
    prescriptionAttested: false, pharmacyReviewStatus: "not_required",
    items: [{ productListingId: "p1", titleAr: "p1", unitPrice: 10, quantity: 1, requiresPrescription: false }],
    createdAt: "2026-10-21T00:00:00.000Z", updatedAt: "2026-10-21T00:00:00.000Z",
    ...overrides,
  };
}

function basketService(products: ReturnType<typeof product>[]) {
  const calls = { create: 0, quote: 0 };
  const repo = {
    findIdempotent: async () => undefined,
    findProducts: async () => products,
    create: async (value: FulfillmentOrder) => { calls.create += 1; return value; },
    quoteFoodPromotion: async (input: { subtotal: number }) => {
      calls.quote += 1;
      return { merchantBusinessId: "merchant-1", vertical: "food", currency: "USD",
        subtotal: input.subtotal, discountAmount: 0, discountedSubtotal: input.subtotal };
    },
  };
  return {
    calls,
    service: new OrderService(repo as never, {} as never,
      { getCurrentUser: async () => ({ id: "customer-1" }) } as never),
  };
}

test("exact decimal cents accept the NUMERIC(14,2) limit and reject one cent above it", () => {
  assert.equal(orderMoneyCents("999999999999.98", "subtotal"), 99_999_999_999_998n);
  assert.equal(orderMoneyCents("999999999999.99", "subtotal"), 99_999_999_999_999n);
  assert.equal(orderMoneyCents(maximum, "subtotal"), 99_999_999_999_999n);
  assert.throws(() => orderMoneyCents("1000000000000.00", "subtotal"), isBadRequest);
  assert.throws(() => orderMoneyCents(1_000_000_000_000, "subtotal"), isBadRequest);
});

test("exact line arithmetic keeps existing allowed product and quantity boundaries", () => {
  assert.equal(validateProductWrite({ price: maximumProductPrice }, true).price, maximumProductPrice);
  assert.equal(validateOrderQuote({ items: [{ productListingId: "p1", quantity: 50 }] }).items[0]?.quantity, 50);
  assert.equal(orderSubtotal([{ unitPrice: "999999999999.00", quantity: 1 }]), maximumProductPrice);
  assert.equal(orderSubtotal([{ unitPrice: "19999999999.99", quantity: 50 }]), 999_999_999_999.50);
  assert.throws(() => orderSubtotal([{ unitPrice: "999999999999.00", quantity: 2 }]), isBadRequest);
  assert.throws(() => orderSubtotal([{ unitPrice: "999999999999.00", quantity: 50 }]), isBadRequest);
});

test("aggregate arithmetic permits near-max and exact-max baskets and rejects overflow across valid lines", () => {
  const first = { unitPrice: "999999999999.00", quantity: 1 };
  assert.equal(orderSubtotal([first, { unitPrice: "0.98", quantity: 1 }]), 999_999_999_999.98);
  assert.equal(orderSubtotal([first, { unitPrice: "0.99", quantity: 1 }]), maximum);
  assert.throws(() => orderSubtotal([first, { unitPrice: "1.00", quantity: 1 }]), isBadRequest);
  assert.throws(() => orderSubtotal([
    { unitPrice: "600000000000.00", quantity: 1 },
    { unitPrice: "400000000000.00", quantity: 1 },
  ]), isBadRequest);
});

test("normal cents and existing numeric tolerance remain exact without accepting negative or fractional cents", () => {
  assert.equal(orderSubtotal([{ unitPrice: "0.10", quantity: 1 }, { unitPrice: "0.20", quantity: 1 }]), 0.3);
  assert.equal(orderTotal(0.3, 0.1, 0.1 + 0.2), 0.5);
  for (const invalid of [-1e-12, -0.01, 0.001, "0.001", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => orderMoneyCents(invalid, "deliveryFee"), isBadRequest);
  }
});

test("quoted total subtracts the discount before checking fee overflow", () => {
  assert.equal(orderTotal("999999999999.99", "0.00", 0), maximum);
  assert.throws(() => orderTotal("999999999999.99", "0.00", 0.01), isBadRequest);
  assert.equal(orderTotal("999999999999.99", "0.01", 0.01), maximum);
  assert.throws(() => orderTotal("999999999999.99", "0.01", 0.02), isBadRequest);
});

test("basket create and promotion quote reject line and aggregate overflow before repository writes", async () => {
  const cases = [
    { products: [product("p1", "999999999999.00")], items: [{ productListingId: "p1", quantity: 2 }] },
    { products: [product("p1", "600000000000.00"), product("p2", "400000000000.00")],
      items: [{ productListingId: "p1", quantity: 1 }, { productListingId: "p2", quantity: 1 }] },
    { products: [product("p1", "999999999999.00"), product("p2", "1.00")],
      items: [{ productListingId: "p1", quantity: 1 }, { productListingId: "p2", quantity: 1 }] },
  ];
  for (const fixture of cases) {
    const { service, calls } = basketService(fixture.products);
    await assert.rejects(() => service.create("cookie", {
      items: fixture.items, deliveryAddress: "دمشق المزة", customerPhone: "0999999999",
    }, "overflow-request-key-123"), isBadRequest);
    await assert.rejects(() => service.quote("cookie", { items: fixture.items }), isBadRequest);
    assert.deepEqual(calls, { create: 0, quote: 0 });
  }
});

test("service preserves exact-max and ordinary basket amounts for creation and promotion quotes", async () => {
  for (const fixture of [
    { prices: ["999999999999.00", "0.99"], expected: maximum },
    { prices: ["0.10", "0.20"], expected: 0.3 },
  ]) {
    const { service, calls } = basketService(fixture.prices.map((price, i) => product(`p${i + 1}`, price)));
    const items = fixture.prices.map((_, i) => ({ productListingId: `p${i + 1}`, quantity: 1 }));
    const created = await service.create("cookie", {
      items, deliveryAddress: "دمشق المزة", customerPhone: "0999999999",
    }, "valid-boundary-request-key");
    const quoted = await service.quote("cookie", { items });
    assert.equal(created.subtotal, fixture.expected);
    assert.equal(quoted.subtotal, fixture.expected);
    assert.deepEqual(calls, { create: 1, quote: 1 });
  }
});

test("merchant fee quote rejects overflow with 400 before attempting the transition", async () => {
  let transitions = 0;
  const current = order({ subtotal: maximum });
  const repo = {
    findById: async () => current,
    transition: async () => { transitions += 1; return { ...current, status: "quoted" }; },
  };
  const service = new OrderService(repo as never, {} as never,
    { getCurrentUser: async () => ({ id: "merchant-owner" }) } as never);
  await assert.rejects(() => service.transition("cookie", current.id, { status: "quoted", deliveryFee: 0.01 }), isBadRequest);
  assert.equal(transitions, 0);
  await service.transition("cookie", current.id, { status: "quoted", deliveryFee: 0 });
  assert.equal(transitions, 1);
});

test("merchant fee quote preserves a valid promotion discount at the maximum total", async () => {
  const current = order({ subtotal: maximum, discountAmount: 0.01 });
  const fees: number[] = [];
  const repo = {
    findById: async () => current,
    transition: async (_order: FulfillmentOrder, _next: string, _actor: string, options: { deliveryFee: number }) => {
      fees.push(options.deliveryFee);
      return { ...current, status: "quoted", total: maximum, deliveryFee: options.deliveryFee };
    },
  };
  const service = new OrderService(repo as never, {} as never,
    { getCurrentUser: async () => ({ id: "merchant-owner" }) } as never);
  const quoted = await service.transition("cookie", current.id, { status: "quoted", deliveryFee: 0.01 });
  assert.equal(quoted.total, maximum);
  await assert.rejects(() => service.transition("cookie", current.id, { status: "quoted", deliveryFee: 0.02 }), isBadRequest);
  assert.deepEqual(fees, [0.01]);
});

test("repository independently rejects line, subtotal and snapshot mismatch before opening a transaction", async () => {
  let transactions = 0;
  const repo = new OrderRepository({ transaction: async () => { transactions += 1; throw new Error("unexpected transaction"); } } as never);
  const item = order().items[0]!;
  for (const invalid of [
    order({ subtotal: maximum, items: [{ ...item, unitPrice: maximumProductPrice, quantity: 2 }] }),
    order({ subtotal: maximum, items: [
      { ...item, unitPrice: 600_000_000_000 },
      { ...item, productListingId: "p2", unitPrice: 400_000_000_000 },
    ] }),
    order({ subtotal: 1_000_000_000_000 }),
    order({ subtotal: 9.99 }),
  ]) {
    await assert.rejects(() => repo.create(invalid, "repository-boundary-key"), isBadRequest);
  }
  assert.equal(transactions, 0);
});

function transitionRepository(current: { subtotal: string; discount_amount: string } | undefined) {
  const reads: { sql: string; values: unknown[] }[] = [];
  const writes: string[] = [];
  const db = {
    transaction: async (run: (client: unknown) => Promise<unknown>) => run({
      query: async (sql: string, values: unknown[] = []) => {
        if (/^\s*(INSERT|UPDATE|DELETE)\b/.test(sql)) writes.push(sql);
        else reads.push({ sql, values });
        if (sql.startsWith("SELECT subtotal,discount_amount FROM fulfillment_orders"))
          return { rows: current ? [current] : [], rowCount: current ? 1 : 0 };
        // A zero-row guarded UPDATE ends this fixture before event/notification work.
        return { rows: [], rowCount: 0 };
      },
    }),
  };
  return { repo: new OrderRepository(db as never), reads, writes };
}

test("repository uses the locked current monetary row and rejects fee overflow before any write", async () => {
  const { repo, reads, writes } = transitionRepository({ subtotal: "999999999999.99", discount_amount: "0.00" });
  const stale = order({ subtotal: 10 });
  await assert.rejects(() => repo.transition(stale, "quoted", "merchant-owner", {
    authority: "merchant", deliveryFee: 0.01,
  }), isBadRequest);
  assert.equal(writes.length, 0);
  const locked = reads.find(({ sql }) => sql.startsWith("SELECT subtotal,discount_amount FROM fulfillment_orders"));
  assert.ok(locked);
  assert.match(locked.sql, /WHERE id=\$1 AND status=\$2 FOR UPDATE$/);
  assert.deepEqual(locked.values, [stale.id, "placed"]);
});

test("repository permits exact-limit totals to reach the existing guarded update", async () => {
  for (const fixture of [{ discount: "0.00", fee: 0 }, { discount: "0.01", fee: 0.01 }]) {
    const { repo, writes } = transitionRepository({ subtotal: "999999999999.99", discount_amount: fixture.discount });
    await repo.transition(order(), "quoted", "merchant-owner", { authority: "merchant", deliveryFee: fixture.fee });
    assert.equal(writes.length, 1);
    assert.match(writes[0]!, /^UPDATE fulfillment_orders/);
  }
});

test("repository exits without a write when the quoted row no longer has the expected status", async () => {
  const { repo, writes } = transitionRepository(undefined);
  const result = await repo.transition(order(), "quoted", "merchant-owner", { authority: "merchant", deliveryFee: 0 });
  assert.equal(result, undefined);
  assert.equal(writes.length, 0);
});
