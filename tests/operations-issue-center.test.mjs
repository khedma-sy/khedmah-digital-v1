import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
test('operations issue center is durable accountable and lifecycle constrained',async()=>{
  const [migration,rollback,repository,service,page]=await Promise.all([
    read('backend/migrations/versions/030_operations_issue_center.sql'),read('backend/migrations/versions/030_operations_issue_center_rollback.sql'),read('apps/backend/src/operations-product/operations-product.repository.ts'),read('apps/backend/src/operations-product/operations-product.service.ts'),read('apps/frontend/app/admin/operations-product/page.tsx')
  ]);
  assert.match(migration,/CREATE TABLE operations_incidents/);assert.match(migration,/CREATE TABLE operations_incident_events/);assert.match(migration,/operations_incidents_resolution_check/);assert.match(rollback,/DROP TABLE IF EXISTS operations_incident_events/);
  assert.match(repository,/FOR UPDATE/);assert.match(repository,/INVALID_INCIDENT_TRANSITION/);assert.match(repository,/INCIDENT_ASSIGNEE_REQUIRED/);assert.match(repository,/operations_incident_events/);
  assert.match(service,/'incidents.manage'/);assert.match(page,/مركز المشاكل والإصلاحات/);assert.match(page,/إرسال للتحقق/);assert.match(page,/اعتماد الإغلاق/);
});
