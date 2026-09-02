export const LAUNCH_CAMPAIGN_END_AT = process.env.NEXT_PUBLIC_LAUNCH_CAMPAIGN_END_AT
  ?? '2026-10-02T00:00:00.000Z';

export const LAUNCH_CAMPAIGN_MESSAGE = 'التسجيل مجاني بمناسبة إطلاق خدمة لمدة شهر';
export const KHEDMA_SHARE_SIGNATURE = '☂ خدمة — تحت مظلة واحدة';

export function isLaunchCampaignActive(now = Date.now()): boolean {
  const endAt = Date.parse(LAUNCH_CAMPAIGN_END_AT);
  return Number.isFinite(endAt) && now < endAt;
}

export function buildKhedmaShareText(subject: string, url: string, now = Date.now()): string {
  const lines = [KHEDMA_SHARE_SIGNATURE, subject.trim()];
  if (isLaunchCampaignActive(now)) lines.push(LAUNCH_CAMPAIGN_MESSAGE);
  lines.push(url);
  return lines.filter(Boolean).join('\n');
}
