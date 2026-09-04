import { BrandMark } from './brand-mark';
import { OfficialSocialLinks } from './official-social-links';

export function OfficialContactLinks() {
  return <footer id="sitewide-social-footer" className="official-contact" aria-labelledby="official-contact-title">
    <div className="official-contact-brand"><BrandMark compact/><strong id="official-contact-title">صفحاتنا على مواقع التواصل</strong></div>
    <OfficialSocialLinks />
  </footer>;
}
