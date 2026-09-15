import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
test('official social destinations are restored once through the global footer', async () => {
  const links = await read('apps/frontend/lib/official-links.ts');
  for (const url of ['https://t.me/KHEDMASYRIA', 'https://www.youtube.com/@khedma-q5d', 'https://whatsapp.com/channel/0029Vb8OwhVGOj9gPtjqdO0c', 'https://wa.me/qr/NVHTJ3SCG3SOD1', 'https://www.facebook.com/khedma.uk', 'https://www.instagram.com/khedmasy/', 'https://www.threads.com/@khedmasy']) assert.ok(links.includes(url));
  const social = await read('apps/frontend/app/components/official-social-links.tsx');
  assert.equal((social.match(/<a href=/g) || []).length, 6);
  assert.equal((social.match(/rel="noopener noreferrer"/g) || []).length, 6);
  assert.equal((social.match(/aria-label=/g) || []).length, 7);
  const layout = await read('apps/frontend/app/layout.tsx');
  assert.equal((layout.match(/<OfficialSocialLinks/g) || []).length, 1);
  assert.ok(layout.includes('KHEDMAH_WHATSAPP_CONTACT_URL'));
});
test('auth restores the historical pair of decorative umbrellas using the canonical palette', async () => {
  const svg = await read('apps/frontend/public/brand/auth-umbrella-pattern.svg');
  assert.equal((svg.match(/<use href="#umbrella"/g) || []).length, 2);
  assert.deepEqual([...new Set(svg.match(/#[0-9a-fA-F]{6}\b/g))].sort(), ['#07427c', '#81be49', '#fd9603'].sort());
  const css = await read('apps/frontend/app/auth-experience.css');
  assert.match(css, /auth-experience::before[^}]*pointer-events:none/s);
  assert.match(css, /auth-umbrella-pattern\.svg/);
});
