import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('launch campaign is global, time bounded and links to registration', async () => {
  const [layout, banner, campaign] = await Promise.all([
    read('app/layout.tsx'), read('app/components/launch-campaign-banner.tsx'), read('lib/launch-campaign.ts')
  ]);
  assert.match(layout, /<LaunchCampaignBanner \/>/);
  assert.ok(layout.indexOf('<LaunchCampaignBanner />') < layout.indexOf('<header className="khedma-header">'));
  assert.match(banner, /isLaunchCampaignActive/);
  assert.match(banner, /useState\(\(\) => isLaunchCampaignActive\(\)\)/);
  assert.match(banner, /\/auth\/register/);
  assert.match(campaign, /2026-10-02T00:00:00\.000Z/);
  assert.match(campaign, /التسجيل مجاني بمناسبة إطلاق خدمة لمدة شهر/);
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
