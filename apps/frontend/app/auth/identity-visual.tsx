import { PlatformIcon } from '../components/platform-icon';
import { BrandMark } from '../components/brand-mark';

const services = [
  { icon: 'tools' as const, label: 'صيانة' },
  { icon: 'briefcase' as const, label: 'أعمال' },
  { icon: 'home' as const, label: 'عقارات' },
  { icon: 'car' as const, label: 'نقل' },
  { icon: 'cart' as const, label: 'تسوق' }
];

export function IdentityVisual() {
  return (
    <section className="identity-visual identity-visual-approved" aria-label="خدمات منصة خدمة">
      <div className="identity-approved-brand">
        <BrandMark />
        <p>كل ما تحتاجه أقرب إليك</p>
      </div>
      <div className="identity-service-grid" aria-label="مجالات الخدمة">
        {services.map(({ icon, label }) => (
          <span key={label}><PlatformIcon name={icon} size={21} /><b>{label}</b></span>
        ))}
      </div>
      <p className="identity-approved-proof"><PlatformIcon name="check" size={18} /> بحث واضح، ملفات منظمة، وتواصل مباشر</p>
    </section>
  );
}
