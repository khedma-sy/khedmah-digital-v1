import Link from 'next/link';
import { notFound } from 'next/navigation';
import { provinceBySlug, provinces, serviceCategories } from '../../../lib/platform-data';

export function generateStaticParams() { return provinces.map(({ slug }) => ({ slug })); }

export default async function ProvincePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const province = provinceBySlug(slug);
  if (!province) notFound();
  return <main id="foundation-content" className="province-page">
    <header className="province-hero"><Link href="/" className="province-back">→ العودة إلى خريطة سوريا</Link><div><p className="eyebrow">خدمة ديجتل · سوريا</p><h1>خدمات {province.name}</h1><p>اكتشف أفضل المهنيين والأعمال والخدمات في {province.name}، ضمن شبكة رقمية واحدة.</p></div><div className="province-signal"><span /><b>{province.name}</b><small>متصل بالشبكة</small></div></header>
    <section className="province-content"><div className="province-toolbar"><div><p className="eyebrow">مدينة الخدمات</p><h2>ماذا تبحث عنه اليوم؟</h2></div><form action="/search"><input name="q" placeholder={`ابحث في ${province.name}...`} /><input type="hidden" name="location" value={slug}/><button>بحث</button></form></div><div className="service-city-grid">{serviceCategories.map(category => <Link href={`/search?location=${slug}&q=${encodeURIComponent(category.name)}`} className={`service-city-card service-${category.color}`} key={category.name}><span className="service-city-icon">{category.icon}</span><h3>{category.name}</h3><p>{category.description}</p><span className="service-arrow">←</span></Link>)}</div></section>
    <section className="province-join"><div><p className="eyebrow">هل تقدم خدمة في {province.name}؟</p><h2>ضع نشاطك على خريطة خدمة ديجتل</h2><p>أنشئ ملفاً احترافياً، شارك رابطك واستقبل عملاءك.</p></div><Link href="/auth/register" className="experience-action">انضم كشريك</Link></section>
  </main>;
}
