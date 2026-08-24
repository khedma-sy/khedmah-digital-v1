import { BrandMark } from '../components/brand-mark';

export function IdentityVisual() {
  return (
    <section className="identity-visual" aria-label="هوية منصة خدمة">
      <BrandMark />
      <div className="identity-brand">
        <span>مظلة الخدمات</span>
        <strong>خدمة</strong>
        <small>خدمات وأعمال ومهنيون تحت مظلة واحدة</small>
      </div>
    </section>
  );
}
