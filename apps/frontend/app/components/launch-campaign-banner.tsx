'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isLaunchCampaignActive, LAUNCH_CAMPAIGN_MESSAGE } from '../../lib/launch-campaign';

export function LaunchCampaignBanner() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(isLaunchCampaignActive());
    const timer = window.setInterval(() => setActive(isLaunchCampaignActive()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!active) return null;

  return (
    <aside className="launch-campaign" aria-label="عرض إطلاق خدمة">
      <span aria-hidden="true" className="launch-campaign-mark">☂</span>
      <strong>{LAUNCH_CAMPAIGN_MESSAGE}</strong>
      <Link href="/auth/register">سجّل الآن</Link>
    </aside>
  );
}
