import assert from 'node:assert/strict';
import test from 'node:test';
import { NotificationService } from './notification.service';

function setup(userId = 'user-1') {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const repository = {
    publish: async (...args: unknown[]) => { calls.push({ method: 'publish', args }); },
    list: async (...args: unknown[]) => { calls.push({ method: 'list', args }); return [{ id: 'n-1' }]; },
    unreadCount: async (...args: unknown[]) => { calls.push({ method: 'count', args }); return 2; },
    markRead: async (...args: unknown[]) => { calls.push({ method: 'read', args }); return args[1] === 'n-1'; },
    markAllRead: async (...args: unknown[]) => { calls.push({ method: 'all', args }); return 2; }
  };
  const identity = { getCurrentUser: async () => ({ id: userId }) };
  return { calls, service: new NotificationService(repository as never, identity as never) };
}

test('lists only notifications owned by the authenticated user and returns unread count', async () => {
  const { calls, service } = setup();
  const result = await service.list('session', '20');
  assert.deepEqual(result, { notifications: [{ id: 'n-1' }], unreadCount: 2 });
  assert.deepEqual(calls.filter(call => call.method === 'list')[0]?.args, ['user-1', 20]);
  assert.deepEqual(calls.filter(call => call.method === 'count')[0]?.args, ['user-1']);
});

test('rejects unsafe list limits', async () => {
  await assert.rejects(() => setup().service.list('session', '101'), /limit must be between/);
  await assert.rejects(() => setup().service.list('session', 'not-a-number'), /limit must be between/);
});

test('read operations are scoped to the authenticated user', async () => {
  const { calls, service } = setup('owner');
  await service.markRead('session', 'n-1');
  await assert.rejects(() => service.markRead('session', 'foreign'), /not found/i);
  assert.deepEqual(calls.filter(call => call.method === 'read')[0]?.args, ['owner', 'n-1']);
  assert.equal(await service.markAllRead('session'), 2);
});
