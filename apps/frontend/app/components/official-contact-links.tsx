import { KHEDMAH_FACEBOOK_URL, KHEDMAH_WHATSAPP_CHANNEL_URL, officialWhatsappContactUrl } from '../../lib/official-links';
import { BrandMark } from './brand-mark';
import { PlatformIcon } from './platform-icon';
import { SocialProviderIcon } from '../auth/social-provider-icon';

export function OfficialContactLinks() {
  const whatsappContactUrl = officialWhatsappContactUrl();
  return <footer className="official-contact" aria-labelledby="official-contact-title">
    <div className="official-contact-brand"><BrandMark compact/><div><strong id="official-contact-title">ابقَ قريبًا من خدمة</strong><span>القنوات الرسمية للمتابعة والتواصل</span></div></div>
    <nav aria-label="قنوات خدمة الرسمية">
      <a href={KHEDMAH_WHATSAPP_CHANNEL_URL} target="_blank" rel="noopener noreferrer"><PlatformIcon name="bell" size={18}/><span><strong>قناة واتساب</strong><small>تابع الخدمات والعروض والأخبار</small></span></a>
      {whatsappContactUrl?<a href={whatsappContactUrl} target="_blank" rel="noopener noreferrer"><PlatformIcon name="phone" size={18}/><span><strong>اتصل عبر واتساب</strong><small>للاستفسار وإضافة نشاطك</small></span></a>:<span className="official-contact-unavailable" aria-disabled="true"><PlatformIcon name="phone" size={18}/><span><strong>واتساب الاتصال</strong><small>الرابط الرسمي قيد التحقق</small></span></span>}
      <a href={KHEDMAH_FACEBOOK_URL} target="_blank" rel="noopener noreferrer"><SocialProviderIcon provider="facebook"/><span><strong>khedma.uk على فيسبوك</strong><small>تابع الصفحة الرسمية</small></span></a>
    </nav>
  </footer>;
}
