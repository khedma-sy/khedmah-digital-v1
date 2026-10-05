import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException, HttpException, Module, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { classifiedsApi } from '../../../frontend/lib/classifieds-client';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import { AdController } from './ad.controller';
import { AdService } from './ad.service';

test('Classifieds client consumes the installed safe error filter over HTTP without inventing domain codes', async (t) => {
  let failure: HttpException;
  const writes: unknown[] = [];
  const ads = { create: async (_cookie: unknown, body: unknown) => { writes.push(body); throw failure; } };
  @Module({ controllers: [AdController], providers: [{ provide: AdService, useValue: ads }] })
  class FixtureModule {}
  const app = await NestFactory.create(FixtureModule, { logger: false });
  try {
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter({ logErrorContext: () => undefined } as never));
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const nativeFetch = globalThis.fetch;
    let requests = 0;
    t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
      requests += 1;
      return nativeFetch(new URL(url, base), init);
    });
    const cases = [
      { name: 'stale content revision', error: new ConflictException({ code: 'CONTENT_REVISION_CONFLICT', message: 'private-content-detail' }), status: 409, code: 'request_error', message: 'تعذر إكمال الطلب.' },
      { name: 'reused request key', error: new ConflictException({ code: 'REQUEST_KEY_REBOUND', message: 'private-key-detail' }), status: 409, code: 'request_error', message: 'تعذر إكمال الطلب.' },
      { name: 'quota exhaustion', error: new HttpException({ code: 'AD_FREE_QUOTA_EXHAUSTED', message: 'private-quota-detail' }, 429), status: 429, code: 'request_error', message: 'تعذر إكمال الطلب.' },
      { name: 'expired session', error: new UnauthorizedException('private-session-detail'), status: 401, code: 'request_error', message: 'تعذر إكمال الطلب.' },
      { name: 'disabled feature', error: new ServiceUnavailableException('private-feature-detail'), status: 503, code: 'internal_error', message: 'الخدمة غير متاحة مؤقتًا. يرجى المحاولة لاحقًا.' },
      { name: 'image validation', error: new BadRequestException({ code: 'AD_IMAGE_LIMIT_REACHED', message: 'private-image-detail' }), status: 400, code: 'validation_error', message: 'تعذر التحقق من البيانات المدخلة.' }
    ];
    for (const [index, item] of cases.entries()) {
      await t.test(item.name, async () => {
        failure = item.error;
        const before = requests;
        const input = { clientRequestId: `classifieds-filter-transport-${index}000`, titleAr: 'مسودة اختبار' };
        await assert.rejects(() => classifiedsApi.create(input), (cause: unknown) => {
          assert.ok(cause instanceof Error);
          const issue = cause as Error & { statusCode?: number; code?: string };
          assert.equal(issue.statusCode, item.status);
          assert.equal(issue.code, item.code);
          assert.equal(issue.message, item.message);
          assert.doesNotMatch(issue.message, /private-|CONTENT_REVISION_CONFLICT|REQUEST_KEY_REBOUND|AD_FREE_QUOTA_EXHAUSTED|AD_IMAGE_LIMIT_REACHED/);
          return true;
        });
        assert.equal(requests, before + 1, 'the client must not retry a rejected write');
        assert.deepEqual(writes.at(-1), input);
      });
    }
  } finally {
    await app.close();
  }
});
