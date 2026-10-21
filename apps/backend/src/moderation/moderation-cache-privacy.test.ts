import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import { ModerationController } from './moderation.controller';

test('private moderation queues and verification decisions forbid shared caching', () => {
  for (const method of [
    'listPending',
    'listPendingVerification',
    'approveVerification',
    'rejectVerification'
  ] as const) {
    const headers = Reflect.getMetadata(HEADERS_METADATA, ModerationController.prototype[method]) ?? [];
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
});
