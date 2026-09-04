import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const scopeUrl = new URL('../docs/product/approved-product-scope.md', import.meta.url);

test('approved product scope preserves Khedmah as a local discovery directory', async () => {
  const scope = await readFile(scopeUrl, 'utf8');
  assert.match(scope, /دليل ذكي لاكتشاف الأنشطة والخدمات المحلية/);
  assert.match(scope, /الاسم الرسمي: \*\*خدمة\*\*/);
  assert.match(scope, /شعار الهوية: \*\*تحت مظلة واحدة\*\*/);
  assert.match(scope, /العبارة التسويقية: \*\*مع خدمة\*\*/);
  assert.match(scope, /15 قسماً رئيسياً و99 تصنيفاً فرعياً/);
  assert.match(scope, /يختار صاحب النشاط تصنيفاً فرعياً/);
  assert.match(scope, /Web وAndroid/);
});

test('V1 remains contact-first and excludes scope-changing features', async () => {
  const scope = await readFile(scopeUrl, 'utf8');
  assert.match(scope, /الدفع والتجارة الإلكترونية/);
  assert.match(scope, /الدردشة الفورية/);
  assert.match(scope, /الإعلانات غير المرتبطة بنشاط منشور أو غير الخاضعة للمراجعة/);
  assert.match(scope, /كل إعلان مرتبط بنشاط منشور/);
});

test('smart administration has full internal product operations with audited guardrails', async () => {
  const scope = await readFile(scopeUrl, 'utf8');
  assert.match(scope, /أدمن ذكي بصفة مدير تشغيل داخلي/);
  assert.match(scope, /سجل تدقيق/);
  assert.match(scope, /لا ينفذ الأدمن الذكي حذفاً نهائياً/);
  assert.match(scope, /اعتماد المنتجات والعروض المطابقة للسياسة الموضوعية آلياً/);
});

test('production deployment requires explicit approval', async () => {
  const scope = await readFile(scopeUrl, 'utf8');
  assert.match(scope, /موافقة المستخدم الصريحة/);
});

test('light, dark, and system themes are mandatory across Web and Android', async () => {
  const scope = await readFile(scopeUrl, 'utf8');
  assert.match(scope, /نهاري، مظلم، وحسب إعداد الجهاز/);
  assert.match(scope, /يُحفظ الاختيار محلياً/);
  assert.match(scope, /منع وميض المظهر المخالف/);
  assert.match(scope, /Web وAndroid/);
});
