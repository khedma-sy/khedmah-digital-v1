import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Arabic smart assistant routes intent and provides private browser speech input', async () => {
  const [assistant, layout] = await Promise.all([
    read('app/components/smart-assistant.tsx'),
    read('app/layout.tsx')
  ]);
  assert.match(layout, /<SmartAssistant\s*\/>/);
  assert.match(assistant, /\/mobility\?type=taxi/);
  assert.match(assistant, /\/mobility\?type=delivery/);
  assert.match(assistant, /\/classifieds\?q=/);
  assert.match(assistant, /\/search\?q=/);
  assert.match(assistant, /webkitSpeechRecognition/);
  assert.match(assistant, /recognition\.lang = 'ar-SY'/);
  assert.match(assistant, /لا يتم حفظ التسجيل الصوتي/);
});
