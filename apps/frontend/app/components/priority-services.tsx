import Link from 'next/link';
import { PlatformIcon, type PlatformIconName } from './platform-icon';

const services: ReadonlyArray<{
  href: string;
  label: string;
  eyebrow: string;
  description: string;
  icon: PlatformIconName;
  tone: 'food' | 'delivery' | 'taxi';
}> = [
  { href: '/restaurants', label: 'اطلب طعامًا', eyebrow: 'المطاعم', description: 'اختر مطعمك وابدأ الطلب.', icon: 'food', tone: 'food' },
  { href: '/mobility?type=delivery', label: 'اطلب مندوب توصيل', eyebrow: 'التوصيل', description: 'أرسل طلبك إلى مندوب قريب.', icon: 'delivery', tone: 'delivery' },
  { href: '/mobility?type=taxi', label: 'ابدأ الرحلة', eyebrow: 'خدمة تكسي', description: 'حدد وجهتك واطلب سيارة.', icon: 'car', tone: 'taxi' },
];

export function PriorityServices() {
  return (
    <section className="ui-priority-services" aria-label="خدمات خدمة الأساسية">
      <header className="ui-priority-services-heading">
        <div>
          <span className="ui-account-kicker">ابدأ مباشرة</span>
          <h2>الخدمات الأساسية</h2>
        </div>
        <p>ثلاثة مسارات واضحة دون خطوات زائدة.</p>
      </header>
      <div className="ui-priority-services-grid">
        {services.map((service) => (
          <Link key={service.href} href={service.href} className={`ui-priority-service ui-priority-service-${service.tone}`}>
            <span className="ui-priority-service-icon"><PlatformIcon name={service.icon} size={24} /></span>
            <span className="ui-priority-service-copy"><em>{service.eyebrow}</em><strong>{service.label}</strong><small>{service.description}</small></span>
            <PlatformIcon name="arrow" size={19} />
          </Link>
        ))}
      </div>
    </section>
  );
}
