import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { AdMediaService } from './ad-media.service';

function makeService() {
  const db = { transaction: async () => { throw new Error('database must not be reached'); } } as any;
  const identity = { getCurrentUser: async () => ({ id: 'owner', email: 'owner@example.test' }) } as any;
  const rbac = { assert() {} } as any;
  return new AdMediaService(db, identity, rbac);
}

async function withFlag<T>(value: string | undefined, work: () => Promise<T>): Promise<T> {
  const previous = process.env.CLASSIFIEDS_ENABLED;
  if (value === undefined) delete process.env.CLASSIFIEDS_ENABLED;
  else process.env.CLASSIFIEDS_ENABLED = value;
  try { return await work(); }
  finally {
    if (previous === undefined) delete process.env.CLASSIFIEDS_ENABLED;
    else process.env.CLASSIFIEDS_ENABLED = previous;
  }
}

test('classifieds media is fail-closed before identity, database or storage work', async () => {
  const service = makeService();
  await assert.rejects(() => withFlag(undefined, () => service.listMine(undefined, 'ad-1')), ServiceUnavailableException);
  await assert.rejects(() => withFlag('TRUE', () => service.listMine(undefined, 'ad-1')), ServiceUnavailableException);
});

test('classifieds media verifies file signature before database or storage work', async () => {
  const service = makeService();
  const fakePng = Buffer.from('not-a-png');
  await assert.rejects(() => withFlag('true', () => service.upload(undefined, 'ad-1', {
    clientRequestId: 'classifieds-media-signature-0001',
    expectedContentRevision: 1,
    filename: 'fake.png',
    mimeType: 'image/png',
    sizeBytes: fakePng.length,
    content: fakePng.toString('base64')
  })), BadRequestException);
});
