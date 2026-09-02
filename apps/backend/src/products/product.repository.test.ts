import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductRepository } from './product.repository';
import type { ProductListing } from './product.types';

const listing: ProductListing = {
  id: 'product-inactive', businessProfileId: 'business-1', ownerUserId: 'owner-1', titleAr: 'منتج محفوظ',
  descriptionAr: 'وصف واضح وكاف للمنتج المعروض للبيع.', price: 100, currency: 'SYP', categoryCode: 'furniture',
  availability: 'in_stock', requiresPrescription: false, controlledItem: false, status: 'active', moderationStatus: 'approved',
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
};

test('atomic submission guard rejects reactivation when the other active listings fill the quota', async () => {
  const queries: string[] = [];
  const database = {
    transaction: async (operation: (client: { query: (sql: string) => Promise<{ rows: Array<{ count?: string }> }> }) => Promise<boolean>) => operation({
      query: async (sql: string) => {
        queries.push(sql);
        return sql.includes('COUNT(*)') ? { rows: [{ count: '3' }] } : { rows: [] };
      }
    })
  };
  const repository = new ProductRepository(database as never);
  assert.equal(await repository.updateWithAutoModerationAudit(listing, true, 3), false);
  assert.equal(queries.length, 2);
  assert.match(queries[0]!, /pg_advisory_xact_lock/);
  assert.match(queries[1]!, /id <> \$2/);
  assert.doesNotMatch(queries.join('\n'), /UPDATE product_listings/);
});

test('atomic submission guard updates and audits when a quota slot is available', async () => {
  const queries: string[] = [];
  const database = {
    transaction: async (operation: (client: { query: (sql: string) => Promise<{ rows: Array<{ count?: string }> }> }) => Promise<boolean>) => operation({
      query: async (sql: string) => {
        queries.push(sql);
        return sql.includes('COUNT(*)') ? { rows: [{ count: '2' }] } : { rows: [] };
      }
    })
  };
  const repository = new ProductRepository(database as never);
  assert.equal(await repository.updateWithAutoModerationAudit(listing, true, 3), true);
  assert.match(queries.join('\n'), /UPDATE product_listings/);
  assert.match(queries.join('\n'), /INSERT INTO audit_logs/);
});
