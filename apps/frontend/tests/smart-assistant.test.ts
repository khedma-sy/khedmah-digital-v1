import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Arabic smart assistant routes intent and provides private browser speech input', async () => {
  const [assistant, layout, styles, authStyles] = await Promise.all([
    read('app/components/smart-assistant.tsx'),
    read('app/layout.tsx'),
    read('app/components/smart-assistant.module.css'),
    read('app/auth-experience.css')
  ]);
  assert.match(layout, /<SmartAssistant\s*\/>/);
  assert.match(assistant, /\/mobility\?type=taxi/);
  assert.match(assistant, /\/mobility\?type=delivery/);
  assert.match(assistant, /\/classifieds\?q=/);
  assert.match(assistant, /\/search\?q=/);
  assert.match(assistant, /webkitSpeechRecognition/);
  assert.match(assistant, /recognition\.lang = 'ar-SY-u-nu-latn'/);
  assert.match(assistant, /لا يتم حفظ التسجيل الصوتي/);
  assert.match(assistant, /smart-assistant/);
  assert.match(styles, /inset-block-end:calc\(max\(\.55rem,env\(safe-area-inset-bottom\)\) \+ 4\.65rem\)/);
  assert.match(authStyles, /\.smart-assistant \{ display:none; \}/);
  assert.match(authStyles, /body:has\(\.auth-experience\) \{ padding-block-end:0; \}/);
});
