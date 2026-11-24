import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IdentityService } from '../identity.service';
import { AllowAnonymousMutation, SessionAuthGuard } from './session-auth.guard';

class ProtectedController {
  mutate() {}
}

function context(
  method: string,
  cookie?: string,
  handler: Function = ProtectedController.prototype.mutate,
  controller: Function = ProtectedController
): ExecutionContext {
  const request = { method, headers: { ...(cookie ? { cookie } : {}) } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => controller
  } as unknown as ExecutionContext;
}

function guardWithSessionFixture() {
  const seenTokens: Array<string | undefined> = [];
  const identity = {
    async getCurrentUser(token: string | undefined) {
      seenTokens.push(token);
      if (token !== 'valid-session') throw new UnauthorizedException('Authentication required.');
      return { id: 'customer-1' };
    }
  } as unknown as IdentityService;
  return { guard: new SessionAuthGuard(identity, new Reflector()), seenTokens };
}

test('safe GET and HEAD do not require a session, while mutations do', async () => {
  const { guard, seenTokens } = guardWithSessionFixture();
  assert.equal(await guard.canActivate(context('GET')), true);
  assert.equal(await guard.canActivate(context('HEAD')), true);
  assert.deepEqual(seenTokens, []);
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    await assert.rejects(guard.canActivate(context(method)), UnauthorizedException);
  }
  assert.deepEqual(seenTokens, [undefined, undefined, undefined, undefined]);
});

test('valid browser session authorizes the global authentication boundary', async () => {
  const { guard, seenTokens } = guardWithSessionFixture();
  assert.equal(await guard.canActivate(context('PATCH', 'other=1; khedmah_session=valid-session')), true);
  assert.deepEqual(seenTokens, ['valid-session']);
});

test('malformed cookie cannot crash the guard or become a valid session', async () => {
  const { guard, seenTokens } = guardWithSessionFixture();
  await assert.rejects(guard.canActivate(context('POST', 'khedmah_session=%')), UnauthorizedException);
  assert.deepEqual(seenTokens, [undefined]);
});

test('anonymous mutation exception applies only to an explicitly decorated handler', async () => {
  class AnonymousController {
    submit() {}
    protectedWrite() {}
  }
  const descriptor = Object.getOwnPropertyDescriptor(AnonymousController.prototype, 'submit');
  assert.ok(descriptor);
  AllowAnonymousMutation()(AnonymousController.prototype, 'submit', descriptor);

  const { guard, seenTokens } = guardWithSessionFixture();
  assert.equal(await guard.canActivate(context('POST', undefined, AnonymousController.prototype.submit, AnonymousController)), true);
  await assert.rejects(
    guard.canActivate(context('POST', undefined, AnonymousController.prototype.protectedWrite, AnonymousController)),
    UnauthorizedException
  );
  assert.deepEqual(seenTokens, [undefined]);
});

test('class-level anonymous metadata cannot grant a blanket write exemption', async () => {
  class MistakenlyDecoratedController {
    publicWrite() {}
    sensitiveWrite() {}
  }
  // Nest's SetMetadata can decorate a controller, but the security exception
  // must only take effect when explicitly placed on the route handler.
  AllowAnonymousMutation()(MistakenlyDecoratedController);

  const publicDescriptor = Object.getOwnPropertyDescriptor(MistakenlyDecoratedController.prototype, 'publicWrite');
  assert.ok(publicDescriptor);
  AllowAnonymousMutation()(MistakenlyDecoratedController.prototype, 'publicWrite', publicDescriptor);

  const { guard, seenTokens } = guardWithSessionFixture();
  assert.equal(await guard.canActivate(context('POST', undefined,
    MistakenlyDecoratedController.prototype.publicWrite, MistakenlyDecoratedController)), true);
  await assert.rejects(
    guard.canActivate(context('DELETE', undefined,
      MistakenlyDecoratedController.prototype.sensitiveWrite, MistakenlyDecoratedController)),
    UnauthorizedException
  );
  assert.equal(await guard.canActivate(context('DELETE', 'khedmah_session=valid-session',
    MistakenlyDecoratedController.prototype.sensitiveWrite, MistakenlyDecoratedController)), true);
  assert.deepEqual(seenTokens, [undefined, 'valid-session']);
});
