import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Web exposes semantic light and dark design tokens', async () => {
  const tokens = await read('apps/frontend/app/design-tokens.css');
  assert.match(tokens, /--k-color-canvas:/);
  assert.match(tokens, /--k-color-surface:/);
  assert.match(tokens, /--k-color-text:/);
  assert.match(tokens, /:root\[data-theme='dark'\]/);
  assert.match(tokens, /color-scheme: dark/);
});

test('Web applies a saved theme before the interface is painted', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  assert.match(layout, /localStorage\.getItem\('khedma-theme'\)/);
  assert.match(layout, /<head><script dangerouslySetInnerHTML/);
  assert.match(layout, /suppressHydrationWarning/);
  assert.match(layout, /<ThemeToggle/);
});

test('theme control supports system, light, and dark with persistence', async () => {
  const toggle = await read('apps/frontend/app/components/theme-toggle.tsx');
  assert.match(toggle, /'system' \| 'light' \| 'dark'/);
  assert.match(toggle, /حسب الجهاز/);
  assert.match(toggle, /نهاري/);
  assert.match(toggle, /مظلم/);
  assert.match(toggle, /localStorage\.setItem\('khedma-theme'/);
  assert.match(toggle, /aria-pressed/);
});

test('Android shares the three persisted theme preferences', async () => {
  const [theme, activity, nightColors] = await Promise.all([
    read('apps/android/app/src/main/java/com/khedmah/digital/KhedmahTheme.kt'),
    read('apps/android/app/src/main/java/com/khedmah/digital/MainActivity.kt'),
    read('apps/android/app/src/main/res/values-night/colors.xml')
  ]);
  assert.match(theme, /System\("system", "حسب الجهاز"\)/);
  assert.match(theme, /Light\("light", "نهاري"\)/);
  assert.match(theme, /Dark\("dark", "مظلم"\)/);
  assert.match(theme, /isSystemInDarkTheme/);
  assert.match(theme, /getSharedPreferences/);
  assert.match(activity, /KhedmahTheme\(themePreference\)/);
  assert.match(activity, /ThemePreferenceBar/);
  assert.doesNotMatch(activity, /Color\(0x|private val Navy|private val Green/);
  assert.match(nightColors, /#07131C/);
});
