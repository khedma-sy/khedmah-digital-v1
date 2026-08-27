import { BrandMark } from '../components/brand-mark';

export function IdentityVisual() {
  return (
    <section className="identity-visual identity-visual-approved" aria-label="خدمات منصة خدمة">
      <div className="identity-language" aria-label="اختيار اللغة">
        <button type="button" aria-pressed="true">العربية</button>
        <span aria-hidden="true">|</span>
        <button type="button" aria-pressed="false" disabled title="English is coming soon">English</button>
      </div>
      <div className="identity-approved-brand">
        <BrandMark />
      </div>
    </section>
  );
}
