'use client';

import Link from 'next/link';
import { ShareAction } from './share-action';

export interface CompanyShowcaseData {
  readonly nameAr: string;
  readonly nameEn: string;
  readonly description: string;
  readonly founderLabel: string;
  readonly location: string;
  readonly services: readonly { readonly title: string; readonly description: string }[];
  readonly logoUrl?: string;
  readonly coverUrl?: string;
}

export function CompanyShowcase({ company }: { readonly company: CompanyShowcaseData }) {
  return (
    <main id="foundation-content" className="founder-profile">
      <section className="founder-cover" aria-label="غلاف خدمة">
        {company.coverUrl ? <img src={company.coverUrl} alt="غلاف خدمة" /> : <span>مظلة رقمية لخدمات موثوقة</span>}
      </section>

      <section className="founder-identity" aria-labelledby="founder-company-name">
        <div className="founder-logo">
          {company.logoUrl ? <img src={company.logoUrl} alt="شعار خدمة" /> : <span aria-hidden="true">خدمة</span>}
        </div>
        <div className="founder-heading">
          <span className="founder-badge">✓ {company.founderLabel}</span>
          <h1 id="founder-company-name">{company.nameAr}</h1>
          {company.nameEn ? <p className="founder-name-en" lang="en" dir="ltr">{company.nameEn}</p> : null}
          <p>{company.description}</p>
          <p className="founder-location">📍 {company.location}</p>
        </div>
        <ShareAction title={company.nameAr} text={`خدمة — ${company.description}`} className="founder-share" />
      </section>

      <section className="founder-section" aria-labelledby="founder-services-title">
        <div className="founder-section-heading">
          <p className="eyebrow">ما الذي نقدمه؟</p>
          <h2 id="founder-services-title">خدمات منصة خدمة</h2>
        </div>
        <div className="founder-service-grid">
          {company.services.map((service) => (
            <article className="founder-service" key={service.title}>
              <h3>{service.title}</h3>
              <p>{service.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="founder-section founder-demo" aria-labelledby="founder-demo-title">
        <div>
          <p className="eyebrow">نموذج المنصة</p>
          <h2 id="founder-demo-title">حضور رقمي واضح لكل عمل ومهني</h2>
          <p>يوضح هذا الملف كيف تعرض الجهات هويتها وخدماتها وموقعها وقنوات التواصل معها ضمن تجربة عامة موثوقة.</p>
        </div>
        <Link href="/search" className="founder-action founder-action-secondary">استكشف المنصة</Link>
      </section>

      <section className="founder-section founder-partner" aria-labelledby="founder-partner-title">
        <div>
          <p className="eyebrow">شراكة ونمو</p>
          <h2 id="founder-partner-title">انضم كشريك</h2>
          <p>أنشئ حضورك عبر ملف أعمال أو ملف مهني أو خدمات قابلة للاكتشاف، وكن جزءاً من مظلة خدمة.</p>
        </div>
        <div className="founder-actions">
          <Link href="/auth/register" className="founder-action">ابدأ الآن</Link>
          <Link href="/business-profiles/new" className="founder-action founder-action-secondary">أنشئ ملف أعمال</Link>
          <Link href="/professional-profiles/new" className="founder-action founder-action-secondary">أنشئ ملفاً مهنياً</Link>
        </div>
      </section>

      <section className="founder-section founder-contact" aria-labelledby="founder-contact-title">
        <div>
          <p className="eyebrow">التواصل</p>
          <h2 id="founder-contact-title">تواصل مع خدمة</h2>
          <p>للاستفسارات والشراكات، ابدأ بإنشاء حسابك وسيتم توفير قنوات التواصل الرسمية عبر المنصة.</p>
        </div>
        <Link href="/auth/register" className="founder-action">تواصل عبر المنصة</Link>
      </section>
    </main>
  );
}
