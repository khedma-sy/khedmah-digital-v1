import type { ReactNode } from 'react';
import { ActionLink, PageHeader, PageShell, Surface } from '../components/ui-primitives';
import { TaxiPlanningPreview } from './taxi-planning-preview';

export const dynamic = 'force-dynamic';

/**
 * Taxi trip execution is intentionally separate from driver onboarding.
 * Driver registration/document review remains available even while trip
 * mutations stay fail-closed behind the reviewed rollout gate.
 */
export default function TaxiRolloutLayout({ children }: { children: ReactNode }) {
  if (process.env.TAXI_TRIPS_ENABLED === 'true') {
    return <div className="khedmah-section-identity" data-khedmah-section="taxi">
      {children}
      <Surface>
        <h2>هل لديك سيارة وتريد العمل مع خدمة؟</h2>
        <p>أنشئ ملف السائق وارفع الوثائق المطلوبة للمراجعة. التسجيل لا يفعّل الرحلات قبل اعتماد السائق والمركبة تشغيلياً.</p>
        <ActionLink href="/taxi-driver-signup">سجّل سيارتك مع خدمة</ActionLink>
      </Surface>
    </div>;
  }

  return <div className="khedmah-section-identity" data-khedmah-section="taxi">
    <PageShell label="خدمة تكسي">
      <PageHeader
        eyebrow="خدمة — التنقل"
        title="خدمة تكسي"
        description="تخطيط المسار متاح للمعاينة، بينما الرحلات التشغيلية غير مفعلة في هذه البيئة حاليًا."
        backHref="/"
      />
      <Surface>
        <TaxiPlanningPreview />
      </Surface>
      <Surface>
        <h2>لديك سيارة؟ انضم إلى خدمة تكسي</h2>
        <p>يمكن تسجيل ملف السائق ورفع الوثائق للمراجعة حتى قبل تفعيل الرحلات التشغيلية في هذه البيئة.</p>
        <ActionLink href="/taxi-driver-signup">سجّل سيارتك مع خدمة</ActionLink>
      </Surface>
      <Surface>
        <h2>ابحث عن مزود تكسي متاح</h2>
        <p>يمكنك استخدام البحث حسب الموقع للتواصل مباشرة مع مقدمي خدمة التكسي المعتمدين حاليًا.</p>
        <ActionLink href="/mobility?type=taxi">البحث عن تكسي قريب</ActionLink>
      </Surface>
    </PageShell>
  </div>;
}
