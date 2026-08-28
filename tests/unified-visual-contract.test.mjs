import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Web shares compact typography and neutral white glass tokens', async () => {
  const tokens = await read('apps/frontend/app/design-tokens.css');
  const primitives = await read('apps/frontend/app/ui-primitives.css');
  assert.match(tokens, /--k-type-display: clamp\(1\.75rem, 2\.6vw, 2\.4rem\)/);
  assert.match(tokens, /--k-type-page: clamp\(1\.3rem, 1\.85vw, 1\.75rem\)/);
  assert.match(tokens, /--k-glass: rgb\(255 255 255 \/ 72%\)/);
  assert.match(tokens, /--k-glass-strong: rgb\(255 255 255 \/ 82%\)/);
  assert.match(primitives, /background:var\(--k-glass\)/);
  assert.match(primitives, /saturate\(108%\)/);
});

test('Home media preserves the complete source image', async () => {
  const home = await read('apps/frontend/app/home.module.css');
  assert.match(home, /\.heroVisual>img[\s\S]*object-fit:contain/);
  assert.match(home, /\.categoryImage img[\s\S]*object-fit:contain/);
  assert.match(home, /font-size:var\(--k-type-display\)/);
  assert.match(home, /background:var\(--k-glass-strong\)/);
});

test('Android applies the same compact hierarchy and never crops owner media', async () => {
  const theme = await read('apps/android/app/src/main/java/com/khedmah/digital/KhedmahTheme.kt');
  const owner = await read('apps/android/app/src/main/java/com/khedmah/digital/OwnerBusinessScreen.kt');
  const activity = await read('apps/android/app/src/main/java/com/khedmah/digital/MainActivity.kt');
  assert.match(theme, /typography = KhedmahTypography/);
  assert.match(theme, /displayLarge = TextStyle\(fontSize = 24\.sp/);
  assert.match(activity, /surface\.copy\(alpha = 0\.82f\)/i);
  assert.match(owner, /contentScale = ContentScale\.Fit/);
  assert.doesNotMatch(owner, /ContentScale\.Crop/);
  assert.doesNotMatch(activity, /fontSize = 34\.sp|fontSize = 27\.sp|fontSize = 26\.sp/);
});
