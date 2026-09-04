export const LAUNCH_CAMPAIGN_MESSAGE = 'التسجيل والاستخدام مجانيان خلال الفترة التجريبية';
export const KHEDMA_SHARE_SIGNATURE = '☂ خدمة — تحت مظلة واحدة';

export function isLaunchCampaignActive(): boolean {
  return process.env.NEXT_PUBLIC_TRIAL_PERIOD_ENABLED !== 'false';
}

export function buildKhedmaShareText(subject: string, url: string): string {
  const lines = [KHEDMA_SHARE_SIGNATURE, subject.trim()];
  if (isLaunchCampaignActive()) lines.push(LAUNCH_CAMPAIGN_MESSAGE);
  lines.push(url);
  return lines.filter(Boolean).join('\n');
}
