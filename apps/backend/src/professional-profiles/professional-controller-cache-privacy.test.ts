import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import { ProfessionalProfilesController } from './professional-profiles.controller';

function assertPrivateCookieVary(method: string): void {
  const headers = Reflect.getMetadata(
    HEADERS_METADATA,
    (ProfessionalProfilesController.prototype as unknown as Record<string, unknown>)[method]
  ) ?? [];
  assert.ok(headers.some((header: { name?: string; value?: string }) =>
    header.name === 'Cache-Control' && header.value === 'private, no-store'),
    `${method} must not be cached`);
  assert.ok(headers.some((header: { name?: string; value?: string }) =>
    header.name === 'Vary' && header.value === 'Cookie'),
    `${method} must vary by session cookie`);
}

test('professional owner and moderation responses are private and not cacheable', () => {
  for (const method of [
    'getMine', 'requestVerification', 'submit',
    'approveModeration', 'rejectModeration', 'suspend'
  ]) assertPrivateCookieVary(method);
});
