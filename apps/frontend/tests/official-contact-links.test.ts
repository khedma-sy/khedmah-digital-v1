import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { officialWhatsappContactUrl } from '../lib/official-links';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('official social pages are globally visible while direct contact remains compact in the account', async () => {
  const [links, component, socialLinks, account, whatsappIcon, brandIcons, layout] = await Promise.all([read('lib/official-links.ts'), read('app/components/official-contact-links.tsx'), read('app/components/official-social-links.tsx'), read('app/users/me/page.tsx'), read('app/components/whatsapp-icon.tsx'), read('app/components/social-brand-icon.tsx'), read('app/layout.tsx')]);
  assert.match(links, /whatsapp\.com\/channel\/0029Vb8OwhVGOj9gPtjqdO0c/);
  assert.match(links, /facebook\.com\/khedma\.uk/);
  assert.match(links, /instagram\.com\/khedmasy/);
  assert.match(links, /threads\.com\/@khedmasy/);
  assert.match(links, /t\.me\/KHEDMASYRIA/);
  assert.match(links, /youtube\.com\/@khedma-q5d/);
  assert.match(component, /صفحاتنا على مواقع التواصل/);
  assert.match(component, /<OfficialSocialLinks/);
  assert.doesNotMatch(component, /<small>|اتصل عبر واتساب|تابع الصفحة/);
  assert.match(socialLinks, /<WhatsappIcon/);
  assert.match(socialLinks, /<SocialProviderIcon provider="facebook"/);
  for (const brand of ['instagram', 'threads', 'telegram', 'youtube']) assert.match(socialLinks, new RegExp(`<SocialBrandIcon brand="${brand}"`));
  assert.doesNotMatch(account, /<OfficialSocialLinks/);
  assert.match(account, /officialWhatsappContactUrl\(\) \?\? KHEDMAH_WHATSAPP_CHANNEL_URL/);
  assert.match(account, /className="ui-account-contact"/);
  assert.match(whatsappIcon, /className="whatsapp-icon"/);
  for (const brand of ['instagram', 'threads', 'telegram', 'youtube']) assert.match(brandIcons, new RegExp(`social-brand-icon-${brand}`));
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
