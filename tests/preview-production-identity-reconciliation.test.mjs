import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { reconcilePreviewIdentities, IDENTITY_CONFIRMATION, IDENTITY_NAMES } from '../scripts/deployment/reconcile-preview-production-identities.mjs';
const old = 'previous-prod-fixture';
const oldHash = createHash('sha256').update(old).digest('hex');
function fixture() {
  const f = { reads: [], patches: [], records: Object.fromEntries(IDENTITY_NAMES.map(name => [name, { name, value: old, updated_at: '2026-10-10T10:00:00Z' }])) };
  f.run = (cmd, args) => {
    assert.equal(cmd, 'gh'); assert.equal(args[1], '--hostname'); assert.equal(args[2], 'github.com');
    const endpoint = args.find(a => a.startsWith('repos/'));
    assert.match(endpoint, /^repos\/khedma-sy\/khedmah-digital-v1\/environments\/preview\/variables\/(PRODUCTION_GOOGLE_CLOUD_PROJECT|PRODUCTION_FIREBASE_PROJECT_ID)$/);
    const name = endpoint.split('/').at(-1);
    if (args.includes('PATCH')) {
      assert.deepEqual(args.slice(-4), ['--raw-field', 'name=' + name, '--raw-field', 'value=khedma-dl']);
      f.patches.push(name); f.records[name] = { name, value: 'khedma-dl', updated_at: '2026-10-11T10:00:00Z' }; return '';
    }
    f.reads.push(name); return JSON.stringify(f.records[name]);
  };
  f.call = (mode = 'plan', emit = () => {}) => reconcilePreviewIdentities(mode, IDENTITY_CONFIRMATION, f.run, emit, oldHash);
  return f;
}
test('plan only reads the two existing Preview variables; apply requires exact confirmation before calls', () => {
  const f = fixture(); f.call(); assert.equal(f.reads.length, 2); assert.equal(f.patches.length, 0);
  assert.throws(() => reconcilePreviewIdentities('apply', 'wrong', () => assert.fail('call before confirmation')), /CONFIRMATION_REQUIRED/);
});
test('unexpected or absent values block every patch during all-variable preflight', () => {
  for (const r of [undefined, { name: IDENTITY_NAMES[1], value: 'unreviewed-project', updated_at: '2026-10-10T10:00:00Z' }]) {
    const f = fixture(); f.records[IDENTITY_NAMES[1]] = r;
    assert.throws(() => f.call('apply')); assert.equal(f.patches.length, 0);
  }
});
test('apply updates exactly two Preview identities, verifies each and supports already-correct state', () => {
  const f = fixture(), events = []; f.call('apply', e => events.push(e));
  assert.deepEqual(f.patches, IDENTITY_NAMES);
  assert.ok(events.includes('PREVIEW_PRODUCTION_IDENTITIES_RECONCILED'));
  f.call('apply'); assert.equal(f.patches.length, 2);
});
test('concurrent change or unconfirmed patch stops without automatic retry or rollback', () => {
  const changed = fixture(); const base = changed.run;
  changed.run = (cmd, args) => { if (changed.reads.length === 2) changed.records[IDENTITY_NAMES[0]].updated_at = '2026-10-11T09:00:00Z'; return base(cmd, args); };
  assert.throws(() => changed.call('apply'), /CONCURRENT_CHANGE_STOP/); assert.equal(changed.patches.length, 0);
  const denied = fixture(); const run = denied.run; let attempts = 0;
  denied.run = (cmd, args) => { if (args.includes('PATCH')) { attempts++; throw Error('DO_NOT_PRINT_SENTINEL'); } return run(cmd, args); };
  assert.throws(() => denied.call('apply'), /^Error: PREVIEW_IDENTITY_PATCH_UNCONFIRMED_STOP_NO_RETRY$/);
  assert.equal(attempts, 1);
});
test('partial success is reported; second failure cannot claim full reconciliation', () => {
  const f = fixture(), run = f.run, events = [];
  f.run = (cmd, args) => { if (args.includes('PATCH') && f.patches.length === 1) throw Error('denied'); return run(cmd, args); };
  assert.throws(() => f.call('apply', e => events.push(e)), /PATCH_UNCONFIRMED/);
  assert.equal(events.filter(x => x.startsWith('STAGE_DONE=')).length, 1);
  assert.ok(!events.includes('PREVIEW_PRODUCTION_IDENTITIES_RECONCILED'));
});
test('no workflow invokes the owner-operated identity correction or releases the hold', () => {
  const s = readFileSync(new URL('../.github/workflows/preview-deployment.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(s, /reconcile-preview-production-identities\.mjs/);
  assert.match(s, /PREVIEW_DIAGNOSTIC_COMPLETE_DEPLOYMENT_HELD'\n          exit 1/);
});
