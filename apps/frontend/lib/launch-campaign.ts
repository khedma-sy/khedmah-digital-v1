export const TRIAL_PERIOD_DAYS = 30;
export const TRIAL_PERIOD_START_AT = process.env.NEXT_PUBLIC_TRIAL_PERIOD_START_AT
  ?? '2026-09-04T00:00:00.000Z';
export const LAUNCH_CAMPAIGN_MESSAGE = 'فترة تجريبية';
export const KHEDMA_SHARE_SIGNATURE = '☂ خدمة — تحت مظلة واحدة';

export function isLaunchCampaignActive(now = Date.now()): boolean {
  const startAt = Date.parse(TRIAL_PERIOD_START_AT);
  const endAt = startAt + (TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  return Number.isFinite(startAt) && now >= startAt && now < endAt;
}

export function buildKhedmaShareText(subject: string, url: string): string {
  const lines = [KHEDMA_SHARE_SIGNATURE, subject.trim()];
  if (isLaunchCampaignActive()) lines.push(LAUNCH_CAMPAIGN_MESSAGE);
  lines.push(url);
  return lines.filter(Boolean).join('\n');
}
