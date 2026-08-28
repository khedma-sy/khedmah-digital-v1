import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('home and authentication each have one canonical visual source', async () => {
  const [home, auth, globals, brand] = await Promise.all([
    read('apps/frontend/app/home.module.css'),
    read('apps/frontend/app/auth-experience.css'),
    read('apps/frontend/app/globals.css'),
    read('apps/frontend/app/brand-system.css')
  ]);

  assert.equal((home.match(/^\.hero \{/gm) ?? []).length, 1);
  assert.equal((home.match(/^\.heroCopy \{/gm) ?? []).length, 1);
  assert.equal((auth.match(/^\.auth-experience \{/gm) ?? []).length, 1);
  assert.equal((auth.match(/^\.auth-panel,$/gm) ?? []).length, 1);
  assert.doesNotMatch(globals, /auth-experience|auth-panel|auth-phone|identity-visual/);
  assert.doesNotMatch(brand, /auth-experience|auth-panel|auth-phone|identity-visual/);
});

test('theme controls stay compact on web and Android', async () => {
  const [web, android] = await Promise.all([
    read('apps/frontend/app/components/theme-toggle.tsx'),
    read('apps/android/app/src/main/java/com/khedmah/digital/MainActivity.kt')
  ]);

  assert.doesNotMatch(web, /<fieldset/);
  assert.match(web, /choose\(next\.value\)/);
  const themeBar = android.slice(android.indexOf('private fun ThemePreferenceBar'), android.indexOf('@Composable private fun AccountScreen'));
  assert.doesNotMatch(themeBar, /FilterChip/);
  assert.match(themeBar, /TextButton\(onClick = \{ onSelect\(next\) \}/);
});

test('public and owner media never crop the uploaded image', async () => {
  const styles = await Promise.all([
    read('apps/frontend/app/home.module.css'),
    read('apps/frontend/app/business-profiles/[id]/public-profile.module.css'),
    read('apps/frontend/app/business-profiles/[id]/manage/provider-core.module.css'),
    read('apps/frontend/app/professional-profiles/[id]/professional-profile.module.css')
  ]);

  for (const css of styles) {
    assert.doesNotMatch(css, /object-fit:\s*cover/);
    assert.match(css, /object-fit:\s*contain/);
  }
});
