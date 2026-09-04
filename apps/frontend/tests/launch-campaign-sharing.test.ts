import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('trial-period banner is global, explicitly controlled and links to registration', async () => {
  const [layout, banner, campaign] = await Promise.all([
    read('app/layout.tsx'), read('app/components/launch-campaign-banner.tsx'), read('lib/launch-campaign.ts')
  ]);
  assert.match(layout, /<LaunchCampaignBanner \/>/);
  assert.ok(layout.indexOf('<LaunchCampaignBanner />') < layout.indexOf('<header className="khedma-header">'));
  assert.match(banner, /isLaunchCampaignActive/);
  assert.match(banner, /\/auth\/register/);
  assert.match(banner, /ابدأ الآن/);
  assert.match(campaign, /NEXT_PUBLIC_TRIAL_PERIOD_ENABLED/);
  assert.match(campaign, /التسجيل والاستخدام مجانيان خلال الفترة التجريبية/);
  assert.doesNotMatch(campaign, /لمدة شهر/);
});

test('all public sharing uses the branded umbrella message and full copied text', async () => {
  const [business, professional, product, shared, campaign] = await Promise.all([
    read('app/business-profiles/[id]/page.tsx'), read('app/professional-profiles/[id]/page.tsx'),
    read('app/store/products/[id]/page.tsx'), read('app/components/share-action.tsx'), read('lib/launch-campaign.ts')
  ]);
  for (const surface of [business, professional, product, shared]) assert.match(surface, /buildKhedmaShareText/);
  assert.match(campaign, /☂ خدمة — تحت مظلة واحدة/);
  assert.match(campaign, /lines\.push\(url\)/);
});
