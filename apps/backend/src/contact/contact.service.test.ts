import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpStatus } from '@nestjs/common';
import { ContactAbuseService } from './contact-abuse.service';
import { ContactBusinessUnavailableError, ContactRateLimitError, ContactValidationError } from './contact.errors';
import { ContactRateLimitService } from './contact-rate-limit.service';
import { ContactRepository } from './contact.repository';
import { ContactService } from './contact.service';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { SessionTokenService } from '../identity/security/session-token.service';
import { PlatformLogger } from '../logging/platform-logger';

function createFixture() {
  const identityRepository = new IdentityRepository();
  const identity = new IdentityService(identityRepository, new SessionTokenService());
  const contacts = new ContactRepository();
  const logger = new PlatformLogger();
  logger.log = () => undefined;
  const service = new ContactService(contacts, identity, identityRepository, new ContactRateLimitService(), new ContactAbuseService(), logger);
  const registration = identity.register({ email: 'user@example.com', password: 'very-secure-password', displayName: 'زائر خدمة' });
  const cookieHeader = `khedmah_session=${registration.sessionToken}`;

  contacts.saveBusinessProfileSnapshot({ id: 'approved-business', visibility: 'public', trustStatus: 'approved', ownerUserId: 'owner-user' });
  contacts.saveBusinessProfileSnapshot({ id: 'private-business', visibility: 'private', trustStatus: 'approved', ownerUserId: 'owner-user' });
  contacts.saveBusinessProfileSnapshot({ id: 'suspended-business', visibility: 'public', trustStatus: 'suspended', ownerUserId: 'owner-user' });

  return { contacts, identityRepository, service, cookieHeader };
}

const validInquiry = {
  name: 'عميل مهتم',
  contactEmail: 'client@example.com',
  message: 'أرغب في معرفة تفاصيل الخدمة المتاحة لديكم.'
};

test('approved business accepts inquiry and creates an audit event', () => {
  const { contacts, identityRepository, service, cookieHeader } = createFixture();
  const receipt = service.submitInquiry(cookieHeader, 'approved-business', validInquiry);

  assert.equal(receipt.businessProfileId, 'approved-business');
  assert.equal(receipt.status, 'submitted');
  assert.equal(contacts.listContactInquiries().length, 1);
  assert.ok(identityRepository.listAuditLogs().some((event) => event.eventType === 'contact.inquiry.submitted'));
});

test('non-public business rejects inquiry', () => {
  const { service, cookieHeader } = createFixture();

  assert.throws(() => service.submitInquiry(cookieHeader, 'private-business', validInquiry), ContactBusinessUnavailableError);
});

test('suspended business rejects inquiry', () => {
  const { service, cookieHeader } = createFixture();

  assert.throws(() => service.submitInquiry(cookieHeader, 'suspended-business', validInquiry), ContactBusinessUnavailableError);
});

test('private data is not exposed in inquiry receipt', () => {
  const { service, cookieHeader } = createFixture();
  const receipt = service.submitInquiry(cookieHeader, 'approved-business', validInquiry);

  assert.deepEqual(Object.keys(receipt).sort(), ['businessProfileId', 'createdAt', 'id', 'status']);
  assert.equal('contactEmail' in receipt, false);
  assert.equal('message' in receipt, false);
  assert.equal('ownerUserId' in receipt, false);
});

test('validation works for inquiry payloads', () => {
  const { service, cookieHeader } = createFixture();

  assert.throws(
    () => service.submitInquiry(cookieHeader, 'approved-business', { name: 'س', contactEmail: 'not-email', message: 'قصير' }),
    ContactValidationError
  );
});

test('contact click tracking records contact intent only', () => {
  const { contacts, service, cookieHeader } = createFixture();
  const receipt = service.trackContactClick(cookieHeader, 'approved-business', { source: 'profile' });

  assert.equal(receipt.businessProfileId, 'approved-business');
  assert.equal(receipt.actionType, 'contact_click');
  assert.equal(contacts.listContactActions().length, 1);
  assert.deepEqual(Object.keys(receipt).sort(), ['actionType', 'businessProfileId', 'id', 'trackedAt']);
});

test('rate limit preparation exists for contact inquiries', () => {
  const { service, cookieHeader } = createFixture();

  for (let index = 0; index < 10; index += 1) {
    service.submitInquiry(cookieHeader, 'approved-business', { ...validInquiry, message: `أرغب في معرفة تفاصيل الخدمة المتاحة لديكم رقم ${index}.` });
  }

  assert.throws(
    () => service.submitInquiry(cookieHeader, 'approved-business', { ...validInquiry, message: 'أرغب في معرفة تفاصيل الخدمة المتاحة لديكم مرة إضافية.' }),
    ContactRateLimitError
  );
});

test('ContactRateLimitError carries HTTP 429 status and safe message', () => {
  const error = new ContactRateLimitError();

  assert.equal(error.getStatus(), HttpStatus.TOO_MANY_REQUESTS);
  assert.equal(error.getStatus(), 429);
  assert.equal(error.message, 'Contact rate limit exceeded.');
});
