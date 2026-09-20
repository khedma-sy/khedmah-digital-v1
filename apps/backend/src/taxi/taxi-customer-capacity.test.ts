import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';

function payload(id:string, quoteId:string, customerId:string, phase='submitted', delivery='requested') {
  return {
    id, customerId, kind:'taxi', merchantId:undefined, method:'courier', phase,
    delivery:{ state:delivery }, version:1, createdAt:1, updatedAt:1,
    quote:{ id:quoteId, customerId, kind:'taxi', currency:'XTS', policyId:'test:1', request:{ kind:'taxi', zone:'test-zone', method:'courier', pickup:{area:'A',detail:'A',latitude:1,longitude:1}, dropoff:{area:'B',detail:'B',latitude:2,longitude:2} }, fingerprint:'x', lines:[], subtotalMinor:0, deliveryMinor:0, totalMinor:100, expiresAt:9999999999999, priceBasis:'metered' },
    cash:{ expectedMinor:100, collectedMinor:0, status:'uncollected' }, issues:[]
  };
}

test('Taxi schema prevents two active trips for one rider but permits a later trip after terminal state', { timeout: 60_000 }, async () => {
  const pool = createTestPool();
  try {
    await resetCanonicalTestSchema(pool);
    await pool.query('DROP SCHEMA IF EXISTS khedmah_taxi CASCADE');
    await pool.query(await readFile(resolve(__dirname, 'sql/access.candidate.sql'), 'utf8'));
    await pool.query(await readFile(resolve(__dirname, 'sql/trips.candidate.sql'), 'utf8'));
    const customer = 'taxi_customer_capacity';
    const quote = async (id:string) => pool.query('INSERT INTO khedmah_taxi.jt_quotes(id,customer_id,expires_at_ms,payload) VALUES($1,$2,$3,$4)', [id,customer,9999999999999,{id}]);
    const order = async (id:string,qid:string,phase='submitted',delivery='requested') => pool.query(
      `INSERT INTO khedmah_taxi.jt_orders(id,quote_id,customer_id,phase,delivery_state,version,payload)
       VALUES($1,$2,$3,$4,$5,1,$6)`, [id,qid,customer,phase,delivery,payload(id,qid,customer,phase,delivery)]);

    await quote('q1'); await quote('q2'); await quote('q3');
    await order('o1','q1');
    await assert.rejects(order('o2','q2'), (error:any) => error.code === '23505' && error.constraint === 'jt_one_active_customer_trip');

    await pool.query(`UPDATE khedmah_taxi.jt_orders SET phase='cancelled',delivery_state='cancelled',payload=$2 WHERE id=$1`,
      ['o1', payload('o1','q1',customer,'cancelled','cancelled')]);
    await order('o3','q3');
    const rows = (await pool.query(`SELECT id,phase FROM khedmah_taxi.jt_orders WHERE customer_id=$1 ORDER BY id`, [customer])).rows;
    assert.deepEqual(rows.map(row => [row.id,row.phase]), [['o1','cancelled'],['o3','submitted']]);
  } finally {
    await pool.query('DROP SCHEMA IF EXISTS khedmah_taxi CASCADE').catch(() => undefined);
    await pool.end();
  }
});
