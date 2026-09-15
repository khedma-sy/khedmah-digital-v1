import {
  KHEDMAH_FACEBOOK_URL,
  KHEDMAH_INSTAGRAM_URL,
  KHEDMAH_TELEGRAM_URL,
  KHEDMAH_THREADS_URL,
  KHEDMAH_WHATSAPP_CHANNEL_URL,
  KHEDMAH_YOUTUBE_URL,
} from '../../lib/official-links';
import { SocialProviderIcon } from '../auth/social-provider-icon';
import { SocialBrandIcon } from './social-brand-icon';
import { WhatsappIcon } from './whatsapp-icon';

export function OfficialSocialLinks({
  className = '',
  whatsappUrl = KHEDMAH_WHATSAPP_CHANNEL_URL,
  whatsappLabel = 'قناة خدمة على واتساب',
}: {
  readonly className?: string;
  readonly whatsappUrl?: string;
  readonly whatsappLabel?: string;
}) {
  return (
    <nav className={`official-social-links ${className}`.trim()} aria-label="صفحاتنا على مواقع التواصل">
      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label={whatsappLabel} title={whatsappLabel}><WhatsappIcon size={30} /></a>
      <a href={KHEDMAH_FACEBOOK_URL} target="_blank" rel="noopener noreferrer" aria-label="خدمة على فيسبوك" title="فيسبوك"><SocialProviderIcon provider="facebook" /></a>
      <a href={KHEDMAH_INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="خدمة على إنستغرام" title="إنستغرام"><SocialBrandIcon brand="instagram" /></a>
      <a href={KHEDMAH_THREADS_URL} target="_blank" rel="noopener noreferrer" aria-label="خدمة على Threads" title="Threads"><SocialBrandIcon brand="threads" /></a>
      <a href={KHEDMAH_TELEGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="خدمة على تيليغرام" title="تيليغرام"><SocialBrandIcon brand="telegram" /></a>
      <a href={KHEDMAH_YOUTUBE_URL} target="_blank" rel="noopener noreferrer" aria-label="خدمة على يوتيوب" title="يوتيوب"><SocialBrandIcon brand="youtube" /></a>
    </nav>
  );
}
