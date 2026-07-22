import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('backend defines the approved health endpoint and response fields only', async () => {
  const controller = await read('apps/backend/src/health.controller.ts');
  const service = await read('apps/backend/src/health.service.ts');
  const app = await read('apps/backend/src/app.ts');

  assert.match(app, /setGlobalPrefix\('api\/v1'\)/);
  assert.match(controller, /@Controller\('health'\)/);
  assert.match(controller, /@Get\(\)/);
  assert.match(service, /status:\s*'ok'/);
  assert.match(service, /timestamp:\s*new Date\(\)\.toISOString\(\)/);
  assert.match(service, /version:/);
  assert.doesNotMatch(service, /user|auth|organization|profile|category|location|search|marketplace|payment/i);
});

test('backend hardening defines request context, safe errors, and typed config defaults', async () => {
  const middleware = await read('apps/backend/src/middleware/request-context.middleware.ts');
  const filter = await read('apps/backend/src/filters/global-exception.filter.ts');
  const config = await read('apps/backend/src/config/platform-config.ts');
  const logger = await read('apps/backend/src/logging/platform-logger.ts');

  assert.match(middleware, /x-request-id/);
  assert.match(middleware, /x-correlation-id/);
  assert.match(filter, /Unexpected platform error/);
  assert.match(filter, /validation_error/);
  assert.match(config, /development/);
  assert.match(config, /staging/);
  assert.match(config, /production/);
  assert.match(logger, /serviceName/);
  assert.match(logger, /requestId/);
  assert.match(logger, /error/);
});

test('frontend defines Arabic-first RTL and accessibility foundations only', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');
  const errorBoundary = await read('apps/frontend/app/error.tsx');
  const loading = await read('apps/frontend/app/loading.tsx');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
  assert.match(styles, /skip-link/);
  assert.match(errorBoundary, /role="alert"/);
  assert.match(loading, /aria-busy="true"/);
});

test('database and infrastructure remain preparation-only', async () => {
  const database = await read('infra/database.md');
  const production = await read('infra/environments/production/README.md');

  assert.match(database, /does not create database tables, entities, schemas, migrations/i);
  assert.match(production, /No production deployment, cloud resources, secrets, credentials, tokens, API keys, passwords, or production URLs/i);
});
