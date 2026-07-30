import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
test('Operations Product dashboard is Arabic-first and includes mandated administration areas', async () => {
  const page = await readFile(new URL('../app/admin/operations-product/page.tsx', import.meta.url), 'utf8');
  for (const area of ['Google Cloud', 'Firebase', 'CI/CD', 'Monitoring', 'Security', 'Releases', 'Deployments', 'Secrets', 'IAM', 'Logs', 'Alerts', 'Incidents', 'Build History', 'Deployment History', 'RBAC']) assert.match(page, new RegExp(area.replace('/', '\\/')));
  assert.match(page, /مركز عمليات البنية التحتية/);
  assert.match(page, /disabled/);
});
