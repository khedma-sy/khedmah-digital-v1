import { PlatformIcon } from '../components/platform-icon';

const services = [
  { icon: 'tools' as const, label: 'صيانة' },
  { icon: 'briefcase' as const, label: 'أعمال' },
  { icon: 'home' as const, label: 'عقارات' },
  { icon: 'car' as const, label: 'نقل' },
  { icon: 'cart' as const, label: 'تسوق' }
];

export function IdentityVisual() {
  return (
    <section className="identity-visual" aria-label="خدمات منصة خدمة ديجتل">
      <div className="service-orbit" aria-hidden="true">
        {services.map(({ icon, label }) => (
          <span className="service-bubble" key={label} title={label}><PlatformIcon name={icon} size={21} /></span>
        ))}
      </div>
      <div className="digital-umbrella" aria-hidden="true">
        <div className="umbrella-glow" />
        <div className="umbrella-canopy-auth" />
        <div className="umbrella-stem-auth" />
        <div className="syria-silhouette">خدمة</div>
      </div>
      <div className="identity-brand">
        <span>مرحباً بك في</span>
        <strong>خدمة <em>ديجتل</em></strong>
        <small>تحت مظلة واحدة</small>
      </div>
    </section>
  );
}
