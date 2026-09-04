'use client';

import { isLaunchCampaignActive, LAUNCH_CAMPAIGN_MESSAGE } from '../../lib/launch-campaign';

export function LaunchCampaignBanner() {
  if (!isLaunchCampaignActive()) return null;

  return (
    <aside className="launch-campaign" aria-label="الفترة التجريبية لخدمة">
      <strong>{LAUNCH_CAMPAIGN_MESSAGE}</strong>
    </aside>
  );
}
