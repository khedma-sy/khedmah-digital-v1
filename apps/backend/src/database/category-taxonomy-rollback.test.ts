import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import { createTestPool, resetCanonicalTestSchema } from './test-pool';

const pool = createTestPool();
after(async () => { await pool.end(); });

test('migration 022 rollback refuses referenced new categories and otherwise restores the pre-022 catalog', async () => {
  await resetCanonicalTestSchema(pool);
  const rollbackSql = await readFile(
    resolve(__dirname, '../../../../backend/migrations/versions/022_expand_category_taxonomy_rollback.sql'),
    'utf8'
  );
  const client = await pool.connect();

  try {
    const snapshot = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM category_taxonomy_022_before_image');
    assert.equal(snapshot.rows[0]?.count, '0');

    await client.query(`
      INSERT INTO service_listings (id, owner_type, owner_id, title_ar, category_code)
      VALUES ('rollback-reference', 'business', 'rollback-owner', 'مرجع اختبار', 'electrician')
    `);

    await client.query('BEGIN');
    await assert.rejects(client.query(rollbackSql), /MIGRATION_022_ROLLBACK_NEW_CATEGORY_REFERENCED/);
    await client.query('ROLLBACK');

    const unchanged = await client.query<{ category_count: string; snapshot_exists: boolean; parent_column_exists: boolean }>(`
      SELECT
        (SELECT COUNT(*)::text FROM categories) AS category_count,
        to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NOT NULL AS snapshot_exists,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'categories'
            AND column_name = 'parent_code'
        ) AS parent_column_exists
    `);
    assert.equal(unchanged.rows[0]?.category_count, '114');
    assert.equal(unchanged.rows[0]?.snapshot_exists, true);
    assert.equal(unchanged.rows[0]?.parent_column_exists, true);

    await client.query("DELETE FROM service_listings WHERE id = 'rollback-reference'");
    await client.query('BEGIN');
    await client.query(rollbackSql);
    await client.query('COMMIT');

    const restored = await client.query<{ category_count: string; snapshot_exists: boolean; parent_column_exists: boolean }>(`
      SELECT
        (SELECT COUNT(*)::text FROM categories) AS category_count,
        to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NOT NULL AS snapshot_exists,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'categories'
            AND column_name = 'parent_code'
        ) AS parent_column_exists
    `);
    assert.equal(restored.rows[0]?.category_count, snapshot.rows[0]?.count);
    assert.equal(restored.rows[0]?.snapshot_exists, false);
    assert.equal(restored.rows[0]?.parent_column_exists, false);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
});
