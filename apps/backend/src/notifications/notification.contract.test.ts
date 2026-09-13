import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../../../backend/migrations/versions/035_platform_notifications.sql', import.meta.url), 'utf8');
const repository = readFileSync(new URL('./notification.repository.ts', import.meta.url), 'utf8');
const orders = readFileSync(new URL('../orders/order.service.ts', import.meta.url), 'utf8');

test('notification storage enforces ownership idempotency and unread indexes', () => {
  assert.match(migration, /REFERENCES core_user_accounts\(user_identifier\) ON DELETE CASCADE/);
  assert.match(migration, /UNIQUE \(user_id, event_key\)/);
  assert.match(migration, /WHERE read_at IS NULL/);
  assert.match(repository, /WHERE id=\$1 AND user_id=\$2/);
  assert.match(repository, /ON CONFLICT \(user_id,event_key\) DO NOTHING/);
});

test('food and courier lifecycle events publish durable participant notifications', () => {
  assert.match(orders, /eventType: 'order\.created'/);
  assert.match(orders, /eventType: 'order\.status_changed'/);
  assert.match(orders, /مهمة توصيل جديدة/);
  assert.match(orders, /الطلب في الطريق/);
  assert.match(orders, /تم تسليم الطلب/);
});
