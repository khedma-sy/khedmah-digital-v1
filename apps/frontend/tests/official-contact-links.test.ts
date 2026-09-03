import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { officialWhatsappContactUrl } from '../lib/official-links';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('official follow and contact channels are distinct and globally visible', async () => {
  const [links, component, account, icon, layout] = await Promise.all([read('lib/official-links.ts'), read('app/components/official-contact-links.tsx'), read('app/users/me/page.tsx'), read('app/components/whatsapp-icon.tsx'), read('app/layout.tsx')]);
  assert.match(links, /whatsapp\.com\/channel\/0029Vb8OwhVGOj9gPtjqdO0c/);
  assert.match(links, /facebook\.com\/khedma\.uk/);
  assert.match(component, /قناة واتساب/);
  assert.match(component, /اتصل عبر واتساب/);
  assert.match(component, /الرابط الرسمي قيد التحقق/);
  assert.match(component, /<WhatsappIcon/);
  assert.match(account, /<WhatsappIcon/);
  assert.match(component, /<SocialProviderIcon provider="facebook"/);
  assert.match(account, /<SocialProviderIcon provider="facebook"/);
  assert.match(icon, /className="whatsapp-icon"/);
  assert.doesNotMatch(component, /PlatformIcon name="(?:phone|bell)"/);
  assert.match(layout, /<OfficialContactLinks/);
});

test('direct WhatsApp contact defaults to the verified contact QR and accepts only canonical WhatsApp links', () => {
  const previous = process.env.NEXT_PUBLIC_KHEDMAH_WHATSAPP_CONTACT_URL;
  try {
    delete process.env.NEXT_PUBLIC_KHEDMAH_WHATSAPP_CONTACT_URL;
    assert.equal(officialWhatsappContactUrl(), 'https://wa.me/qr/NVHTJ3SCG3SOD1');
    for (const invalid of ['', 'https://example.com/12345678', 'http://wa.me/12345678', 'https://wa.me/not-a-number', 'https://wa.me/12345678?text=hidden']) {
      process.env.NEXT_PUBLIC_KHEDMAH_WHATSAPP_CONTACT_URL = invalid;
      assert.equal(officialWhatsappContactUrl(), invalid ? null : 'https://wa.me/qr/NVHTJ3SCG3SOD1');
    }
    process.env.NEXT_PUBLIC_KHEDMAH_WHATSAPP_CONTACT_URL = 'https://wa.me/963991234567';
    assert.equal(officialWhatsappContactUrl(), 'https://wa.me/963991234567');
    process.env.NEXT_PUBLIC_KHEDMAH_WHATSAPP_CONTACT_URL = 'https://wa.me/qr/NVHTJ3SCG3SOD1';
    assert.equal(officialWhatsappContactUrl(), 'https://wa.me/qr/NVHTJ3SCG3SOD1');
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_KHEDMAH_WHATSAPP_CONTACT_URL;
    else process.env.NEXT_PUBLIC_KHEDMAH_WHATSAPP_CONTACT_URL = previous;
  }
});
