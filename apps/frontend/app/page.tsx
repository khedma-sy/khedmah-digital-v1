import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandMark } from './components/brand-mark';
import { PlatformIcon } from './components/platform-icon';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://khedmah.digital';

export const metadata: Metadata = {
  title: 'خدمة… أقرب إليك',
  description: 'خدمة تجمع الأعمال والمهنيين والخدمات الموثوقة تحت مظلة واحدة.',
  alternates: { canonical: SITE_URL }
};

const trustItems = [
  { icon: 'check' as const, title: 'موثوق ومعتمد', description: 'ملفات أعمال ومهنيين تمر عبر ضوابط الثقة والمراجعة.' },
  { icon: 'pin' as const, title: 'قريب منك', description: 'اكتشف الخدمات حسب المحافظة والموقع بسهولة.' },
  { icon: 'grid' as const, title: 'اختيار أوضح', description: 'نتائج منظمة تساعدك على الوصول إلى مقدم الخدمة المناسب.' },
  { icon: 'lock' as const, title: 'آمن وسهل', description: 'تجربة عربية واضحة مع حماية للحسابات والبيانات.' }
];

export default function Home() {
  return (
    <main id="foundation-content" className="khedma-home">
      <section className="khedma-home-hero" aria-labelledby="home-title">
        <div className="khedma-home-copy">
          <p className="eyebrow">تحت مظلة واحدة</p>
          <h1 id="home-title">خدمة… <em>أقرب</em> إليك</h1>
          <p>اكتشف الأعمال والمهنيين والخدمات الموثوقة، وابحث حسب احتياجك وموقعك ثم تواصل مباشرة مع مقدم الخدمة.</p>
          <div className="khedma-home-actions">
            <Link href="/search"><PlatformIcon name="search" /> اكتشف الخدمات</Link>
            <Link href="/auth/register"><PlatformIcon name="briefcase" /> أضف نشاطك</Link>
          </div>
        </div>

        <div className="khedma-home-brand-card" aria-label="هوية خدمة">
          <BrandMark />
        </div>
      </section>

      <section className="khedma-trust-grid" aria-label="مزايا خدمة">
        {trustItems.map((item) => (
          <article className="khedma-trust-card" key={item.title}>
            <PlatformIcon name={item.icon} />
            <h2>{item.title}</h2>
            <p>{item.description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
