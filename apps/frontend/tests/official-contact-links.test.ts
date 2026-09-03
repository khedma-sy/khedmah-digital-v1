import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { officialWhatsappContactUrl } from '../lib/official-links';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('official follow and contact channels are distinct and globally visible', async () => {
  const [links, component, layout] = await Promise.all([read('lib/official-links.ts'), read('app/components/official-contact-links.tsx'), read('app/layout.tsx')]);
  assert.match(links, /whatsapp\.com\/channel\/0029Vb8OwhVGOj9gPtjqdO0c/);
  assert.match(links, /facebook\.com\/khedma\.uk/);
  assert.match(component, /قناة واتساب/);
  assert.match(component, /اتصل عبر واتساب/);
  assert.match(component, /الرابط الرسمي قيد التحقق/);
  assert.match(layout, /<OfficialContactLinks/);
});

test('direct WhatsApp contact accepts only a canonical number link', () => {
  const previous = process.env.NEXT_PUBLIC_KHEDMAH_WHATSAPP_CONTACT_URL;
  try {
    for (const invalid of ['', 'https://example.com/12345678', 'http://wa.me/12345678', 'https://wa.me/not-a-number', 'https://wa.me/12345678?text=hidden']) {
      process.env.NEXT_PUBLIC_KHEDMAH_WHATSAPP_CONTACT_URL = invalid;
      assert.equal(officialWhatsappContactUrl(), null);
    }
    process.env.NEXT_PUBLIC_KHEDMAH_WHATSAPP_CONTACT_URL = 'https://wa.me/963991234567';
    assert.equal(officialWhatsappContactUrl(), 'https://wa.me/963991234567');
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_KHEDMAH_WHATSAPP_CONTACT_URL;
    else process.env.NEXT_PUBLIC_KHEDMAH_WHATSAPP_CONTACT_URL = previous;
  }
});
