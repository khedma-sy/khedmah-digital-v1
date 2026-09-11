import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Executes actual page source using inert JSX and a controlled hook scheduler.
// Verifies content and permission flow, not browser layout or React DOM behavior.
function fixture(path, { permissions = [], failure, productionTrafficEnabled = false } = {}) {
  const slots = []; const effects = []; const redirects = [];
  let cursor = 0, dirty = false, output;
  const overview = {
    roles: ['operations_product_director'], permissions,
    health: { status: 'ready', productionTrafficEnabled },
    services: [{ id: 'ci-cd', label: 'CI/CD', status: 'configured' }],
    openIncidents: 2, pendingChanges: 3
  };
  const router = { replace: (href) => redirects.push(href) };
  const api = {
    auth: { session: async () => ({ user: { profile: { displayName: 'اختبار' } } }) },
    operationsProduct: { overview: async () => {
      if (failure) throw Object.assign(new Error('request failed'), { statusCode: failure });
      return { operationsProduct: overview };
    } }
  };
  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { value: initial };
      return [slots[i].value, (next) => { slots[i].value = next; dirty = true; }];
    },
    useEffect(setup, deps) {
      const i = cursor++;
      if (!slots[i] || !deps.every((dep, j) => Object.is(dep, slots[i].deps[j]))) {
        slots[i] = { deps }; effects.push(setup);
      }
    }
  };
  const jsx = (type, props) => ({ type, props });
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    fileName: path, compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true
    }
  }).outputText;
  const exports = {};
  new Script(code, { filename: path }).runInContext(createContext({ exports, Error,
    require(id) {
      if (id === 'react') return hooks;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (id === 'next/navigation') return { useRouter: () => router };
      if (id === 'next/link') return 'Link';
      if (id.endsWith('/api-client')) return { api };
      throw new Error(`Unexpected dependency: ${id}`);
    }
  }));
  function render() {
    let rounds = 0;
    do {
      dirty = false; cursor = 0; output = exports.default();
      for (const effect of effects.splice(0)) effect();
      assert.ok(++rounds < 20, 'page state must settle');
    } while (dirty);
  }
  function* walk(value) {
    if (Array.isArray(value)) for (const child of value) yield* walk(child);
    else if (value && typeof value === 'object') { yield value; yield* walk(value.props?.children); }
  }
  function text(value) {
    if (value == null || typeof value === 'boolean') return '';
    if (Array.isArray(value)) return value.map(text).join(' ');
    if (typeof value === 'object') return text(value.props?.children);
    return String(value);
  }
  render();
  return { redirects, get text() { return text(output); },
    get links() { return [...walk(output)].filter((node) => node.type === 'Link').map((node) => node.props.href); },
    async flush() { await new Promise(setImmediate); render(); await new Promise(setImmediate); render(); }
  };
}

for (const path of ['apps/frontend/app/admin/page.tsx', 'apps/frontend/app/admin/operations-product/page.tsx']) {
  test(`${path}: reported configuration never claims live health`, async () => {
    const f = fixture(path); await f.flush();
    assert.match(f.text, /ليس فحصاً حياً/);
    assert.doesNotMatch(f.text, /حالة الخدمات الفعلية|خدمات مراقبة|حركة الإنتاج مفعّلة|حركة الإنتاج مقفلة|(?:^|\s)جاهز(?:\s|$)/);
    assert.match(f.text, /مؤقتة في ذاكرة عملية الخادم/);
  });
  test(`${path}: moderation is hidden without permission and visible with security.manage`, async () => {
    const denied = fixture(path); await denied.flush();
    assert.ok(!denied.links.includes('/admin/moderation'));
    const allowed = fixture(path, { permissions: ['security.manage'] }); await allowed.flush();
    assert.ok(allowed.links.includes('/admin/moderation'));
  });
  test(`${path}: 401 redirects safely; 403 is not misrepresented as a login failure`, async () => {
    const unauthenticated = fixture(path, { failure: 401 }); await unauthenticated.flush();
    assert.equal(unauthenticated.redirects.length, 1);
    assert.ok(unauthenticated.redirects[0].startsWith('/auth/login?next=%2Fadmin'));
    const forbidden = fixture(path, { failure: 403 }); await forbidden.flush();
    assert.equal(forbidden.redirects.length, 0); assert.match(forbidden.text, /لا يملك صلاحية/);
  });
}

test('operations display never treats either static traffic flag as live production evidence', async () => {
  for (const productionTrafficEnabled of [false, true]) {
    const f = fixture('apps/frontend/app/admin/operations-product/page.tsx', { productionTrafficEnabled });
    await f.flush(); assert.match(f.text, /حالة الإنتاج غير متحققة حيّاً/);
    assert.match(f.text, /إعداد مسجّل/); assert.match(f.text, /خدمات مدرجة في الإعداد/);
  }
});
