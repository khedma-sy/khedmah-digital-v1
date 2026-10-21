import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import { AdminAdController } from '../classifieds/ad.controller';
import { KoraAdminController } from '../kora-admin/kora-admin.controller';
import { OperationsProductController } from '../operations-product/operations-product.controller';
import { AdminProductController } from '../products/product.controller';
import { AdminReportController } from '../reports/report.controller';
import { TaxiOperationalApprovalController } from '../taxi/taxi-operational-approval.controller';

function assertPrivateCookieVary(controller: object, method: string): void {
  const headers = Reflect.getMetadata(
    HEADERS_METADATA,
    (controller as Record<string, unknown>)[method]
  ) ?? [];
  assert.ok(
    headers.some((header: { name?: string; value?: string }) =>
      header.name === 'Cache-Control' && header.value === 'private, no-store'),
    `${method} must prevent storage by shared or browser caches.`
  );
  assert.ok(
    headers.some((header: { name?: string; value?: string }) =>
      header.name === 'Vary' && header.value === 'Cookie'),
    `${method} must vary authenticated responses by Cookie.`
  );
}

test('approval administration responses carrying account-scoped data are not shared-cacheable', () => {
  for (const method of ['pending', 'review']) {
    assertPrivateCookieVary(AdminProductController.prototype, method);
  }
  for (const method of ['pending', 'moderate']) {
    assertPrivateCookieVary(AdminAdController.prototype, method);
  }
  for (const method of ['candidates', 'status', 'approve', 'suspend', 'revoke']) {
    assertPrivateCookieVary(TaxiOperationalApprovalController.prototype, method);
  }
  for (const method of ['overview', 'inventory', 'history']) {
    assertPrivateCookieVary(OperationsProductController.prototype, method);
  }
  for (const method of ['metrics', 'uiFailures', 'anomalies', 'executive', 'expose']) {
    assertPrivateCookieVary(KoraAdminController.prototype, method);
  }
  assertPrivateCookieVary(AdminReportController.prototype, 'list');
});
