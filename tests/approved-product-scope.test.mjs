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
  assert.match(scope, /الإعلانات المبوبة العامة/);
  assert.match(scope, /إعلانات مرتبطة بأنشطة منشورة فقط/);
});

test('smart administration remains advisory and human-controlled', async () => {
  const scope = await readFile(scopeUrl, 'utf8');
  assert.match(scope, /إدارة ذكية مساعدة/);
  assert.match(scope, /القرار الإداري النهائي بشري ومسجل/);
  assert.match(scope, /لا ينشر أو يرفض المساعد الذكي ملفاً بصورة مستقلة/);
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
