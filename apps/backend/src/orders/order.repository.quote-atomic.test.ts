import assert from 'node:assert/strict';
import test from 'node:test';
import { OrderRepository } from './order.repository';
import type { FulfillmentOrder } from './order.types';

// Offline repository-boundary regression. This deliberately does not connect to Cloud SQL.
test('stale reviewed quote yields no order transition, event, promotion redemption or notification', async () => {
  const sql: string[] = [];
  const quoted: FulfillmentOrder = {
    id: 'order-1', customerUserId: 'customer-1',
    merchantBusinessId: 'merchant-1', merchantOwnerUserId: 'merchant-owner',
    merchantName: 'مطعم', vertical: 'food', status: 'quoted',
    paymentMethod: 'cash', paymentStatus: 'pending', currency: 'SYP',
    subtotal: 1000, discountAmount: 0, deliveryFee: 200, total: 1200,
    deliveryAddress: 'دمشق', customerPhone: '0999999999',
    prescriptionAttested: false, pharmacyReviewStatus: 'not_required',
    items: [], createdAt: '2026-11-11T12:00:00.000Z',
    updatedAt: '2026-11-11T12:00:00.000Z',
  };
  const expectedQuote = { updatedAt: quoted.updatedAt, total: quoted.total!, currency: quoted.currency };
  let updated = false;
  const client = {
    query: async (statement: string, values?: unknown[]) => {
      sql.push(statement);
      if (statement.includes('UPDATE fulfillment_orders SET')) {
        assert.match(statement, /date_trunc\('milliseconds', updated_at\) = \$15/);
        assert.match(statement, /total = \$16::numeric AND currency = \$17::text/);
        assert.equal(values?.[14], expectedQuote.updatedAt);
        assert.equal(values?.[15], expectedQuote.total);
        assert.equal(values?.[16], expectedQuote.currency);
        // Simulate PostgreSQL rejecting the conditional UPDATE atomically.
        updated = true;
        return { rowCount: 0, rows: [] };
      }
      if (updated) throw new Error('SQL after rejected quote UPDATE must not execute');
      return { rowCount: 0, rows: [] };
    },
  };
  const db = {
    transaction: async (callback: (client: typeof client) => Promise<unknown>) => callback(client),
    query: async () => { throw new Error('no post-conflict read is permitted'); },
  };
  const repository = new OrderRepository(db as never);
  const result = await repository.transition(quoted, 'merchant_confirmed', 'customer-1', {
    authority: 'customer', expectedQuote,
  });
  assert.equal(result, undefined);
  assert.equal(updated, true, 'the conditional UPDATE must be attempted');
  assert.equal(sql.filter(statement => statement.includes('UPDATE fulfillment_orders SET')).length, 1);
  assert.equal(sql.some(statement => /INSERT INTO fulfillment_order_events|INSERT INTO .*notifications|UPDATE food_promo_claims/.test(statement)), false);
});
