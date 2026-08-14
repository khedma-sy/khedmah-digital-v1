import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Professional controller delegates submission and owner inbox to the same Contact service', async () => {
  const controller = await read('apps/backend/src/contact/contact.controller.ts');
  assert.match(controller, /type: 'professional', id: professionalProfileId/);
  assert.match(controller, /contactService\.submitInquiry/);
  assert.match(controller, /contactService\.listReceivedProfessionalInquiries/);
});

test('Professional Contact path shares validation idempotency rate-limit abuse and receipt', async () => {
  const service = await read('apps/backend/src/contact/contact.service.ts');
  for (const boundary of ['validateSubmitContactInquiry', 'validateIdempotencyKey', 'findIdempotentInquiry', 'rateLimits.check', 'abuse.shouldBlockInquiry', 'createIdempotentInquiry', 'toPublicInquiryReceipt']) assert.match(service, new RegExp(boundary.replace('.', '\\.')));
  assert.match(service, /targetType: inquiry\.professionalProfileId \? 'professional' : 'business'/);
  assert.match(service, /trackingStatus: inquiry\.trackingStatus/);
});

test('Professional owner inbox is scoped by canonical owner and target column', async () => {
  const [service, repository] = await Promise.all([
    read('apps/backend/src/contact/contact.service.ts'), read('apps/backend/src/contact/contact.repository.ts')
  ]);
  assert.match(service, /professional\.userIdentifier !== actor\.id/);
  assert.match(repository, /WHERE professional_profile_id=\$1/);
  assert.doesNotMatch(repository, /WHERE business_profile_id=\$1 OR professional_profile_id/);
});
