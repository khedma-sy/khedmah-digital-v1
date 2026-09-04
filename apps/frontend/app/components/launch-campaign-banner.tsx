'use client';

import Link from 'next/link';
import { isLaunchCampaignActive, LAUNCH_CAMPAIGN_MESSAGE } from '../../lib/launch-campaign';

export function LaunchCampaignBanner() {
  if (!isLaunchCampaignActive()) return null;

  return (
    <aside className="launch-campaign" aria-label="الفترة التجريبية لخدمة">
      <span aria-hidden="true" className="launch-campaign-mark">☂</span>
      <strong>{LAUNCH_CAMPAIGN_MESSAGE}</strong>
      <Link href="/auth/register">ابدأ الآن</Link>
    </aside>
  );
}
