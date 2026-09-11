import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createStorageAdapter, GcsStorageAdapter, LocalStorageAdapter } from './storage.adapter';

const originalNodeEnv = process.env.NODE_ENV;
const originalBucket = process.env.GCS_MEDIA_BUCKET;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalBucket === undefined) delete process.env.GCS_MEDIA_BUCKET;
  else process.env.GCS_MEDIA_BUCKET = originalBucket;
});

for (const environment of ['production', 'staging']) {
  test(`media storage fails closed without GCS_MEDIA_BUCKET in ${environment}`, () => {
    process.env.NODE_ENV = environment;
    delete process.env.GCS_MEDIA_BUCKET;

    assert.throws(
      () => createStorageAdapter(),
      new RegExp(`GCS_MEDIA_BUCKET is required when NODE_ENV=${environment}`)
    );
  });
}

test('media storage fails closed when durable environment bucket is blank', () => {
  process.env.NODE_ENV = 'production';
  process.env.GCS_MEDIA_BUCKET = '   ';
  assert.throws(() => createStorageAdapter(), /Refusing ephemeral media storage/);
});

test('isolated preview may use disposable local media when no preview bucket exists', () => {
  process.env.NODE_ENV = 'preview';
  delete process.env.GCS_MEDIA_BUCKET;
  assert.ok(createStorageAdapter() instanceof LocalStorageAdapter);
});

test('media storage remains local for development and test-style environments', () => {
  process.env.NODE_ENV = 'development';
  delete process.env.GCS_MEDIA_BUCKET;
  assert.ok(createStorageAdapter() instanceof LocalStorageAdapter);

  process.env.NODE_ENV = 'test';
  assert.ok(createStorageAdapter() instanceof LocalStorageAdapter);
});

test('configured media storage uses GCS in any environment', () => {
  process.env.NODE_ENV = 'preview';
  process.env.GCS_MEDIA_BUCKET = 'khedmah-media-fixture';
  assert.ok(createStorageAdapter() instanceof GcsStorageAdapter);
});
