import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { isLaunchCampaignActive, TRIAL_PERIOD_DAYS, TRIAL_PERIOD_START_AT } from '../lib/launch-campaign';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('trial-period banner uses one short phrase for exactly 30 days without an umbrella mark', async () => {
  const [layout, banner, campaign] = await Promise.all([
    read('app/layout.tsx'), read('app/components/launch-campaign-banner.tsx'), read('lib/launch-campaign.ts')
  ]);
  assert.match(layout, /<LaunchCampaignBanner \/>/);
  assert.ok(layout.indexOf('<LaunchCampaignBanner />') < layout.indexOf('<header className="khedma-header">'));
  assert.match(banner, /isLaunchCampaignActive/);
  assert.match(banner, /\/auth\/register/);
  assert.match(banner, /ابدأ الآن/);
  assert.doesNotMatch(banner, /launch-campaign-mark|☂/);
  assert.match(campaign, /NEXT_PUBLIC_TRIAL_PERIOD_START_AT/);
  assert.match(campaign, /TRIAL_PERIOD_DAYS = 30/);
  assert.match(campaign, /LAUNCH_CAMPAIGN_MESSAGE = 'فترة تجريبية'/);
  assert.match(campaign, /now >= startAt && now < endAt/);
  assert.doesNotMatch(campaign, /التسجيل والاستخدام مجانيان|لمدة شهر/);
  const startAt = Date.parse(TRIAL_PERIOD_START_AT);
  const endAt = startAt + (TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  assert.equal(isLaunchCampaignActive(startAt), true);
  assert.equal(isLaunchCampaignActive(endAt - 1), true);
  assert.equal(isLaunchCampaignActive(endAt), false);
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
