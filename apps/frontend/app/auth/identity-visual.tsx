import { BrandMark, BrandUmbrella } from '../components/brand-mark';
import { PlatformIcon } from '../components/platform-icon';

interface IdentityGatewayAsideProps {
  readonly mode: 'login' | 'register';
}

export function IdentityGatewayOrnaments() {
  return (
    <div className="auth-side-umbrellas" aria-hidden="true">
      <BrandUmbrella className="auth-side-umbrella auth-side-umbrella-start" />
      <BrandUmbrella className="auth-side-umbrella auth-side-umbrella-end" />
    </div>
  );
}

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

export function IdentityGatewayAside({ mode }: IdentityGatewayAsideProps) {
  const isLogin = mode === 'login';

  return (
    <aside className="register-brand-panel" aria-labelledby={`${mode}-page-title`}>
      <IdentityVisual />
      <div className="register-intro">
        <span>{isLogin ? 'مرحبًا بعودتك' : 'ابدأ مع خدمة'}</span>
        <h1 id={`${mode}-page-title`}>{isLogin ? 'ادخل إلى حسابك في خدمة' : 'أنشئ حسابك في خدمة'}</h1>
        <p>حساب واحد لاكتشاف الخدمات والأعمال والمهنيين الموثوقين أو نشر نشاطك تحت مظلة خدمة.</p>
      </div>
      <ul className="register-benefits" aria-label="ما الذي يوفره حساب خدمة؟">
        <li><span><PlatformIcon name="search" /></span><div><strong>اكتشاف أوضح</strong><small>ابحث حسب المجال والتخصص والموقع.</small></div></li>
        <li><span><PlatformIcon name="check" /></span><div><strong>مقدمو خدمة معتمدون</strong><small>قارن المعلومات المنشورة قبل التواصل.</small></div></li>
        <li><span><PlatformIcon name="storefront" /></span><div><strong>مساحة لنشاطك</strong><small>أنشئ ملف نشاطك وأدر محتواه من حسابك.</small></div></li>
      </ul>
      <p className="register-campaign"><PlatformIcon name="check" size={18} /> التسجيل والاستخدام مجانيان خلال المرحلة التجريبية.</p>
    </aside>
  );
}
