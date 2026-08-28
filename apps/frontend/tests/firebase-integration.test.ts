import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteApp } from 'firebase/app';
import { getFirebaseClientServices } from '../lib/firebase/client';
import { getFirebaseAnalytics } from '../lib/firebase/analytics';
import { prepareFirebaseMessaging } from '../lib/firebase/fcm';
import { translateFirebaseSocialAuthError } from '../lib/firebase/auth';

const config = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'test-browser-key-not-production',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'test.invalid',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'firebase-sdk-integration-test',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'firebase-sdk-integration-test.invalid',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '100000000001',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:100000000001:web:test',
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: 'G-TESTONLY'
};

test('modular Firebase initializes Auth, Firestore, and Storage once', async () => {
  Object.assign(process.env, config);
  const first = getFirebaseClientServices();
  const second = getFirebaseClientServices();
  assert.equal(first.app, second.app);
  assert.equal(first.auth.app, first.app);
  assert.equal(first.firestore.app, first.app);
  assert.equal(first.storage.app, first.app);
  await deleteApp(first.app);
});

test('Analytics and Messaging remain inert outside a browser', async () => {
  Object.assign(process.env, config);
  assert.equal(await getFirebaseAnalytics(), null);
  assert.equal(await prepareFirebaseMessaging(), null);
});

test('social authentication failures explain the real Firebase configuration blocker', () => {
  assert.equal(
    translateFirebaseSocialAuthError('Google', { code: 'auth/operation-not-allowed' }).message,
    'تسجيل الدخول عبر Google غير مفعّل في إعدادات Firebase لهذا المشروع.'
  );
  assert.equal(
    translateFirebaseSocialAuthError('Facebook', { code: 'auth/unauthorized-domain' }).message,
    'نطاق الموقع الحالي غير مضاف إلى النطاقات المصرّح بها في Firebase.'
  );
});
