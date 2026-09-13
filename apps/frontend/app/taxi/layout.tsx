import type { ReactNode } from 'react';
import { ActionLink, PageHeader, PageShell, Surface } from '../components/ui-primitives';
import { TaxiPlanningPreview } from './taxi-planning-preview';

export const dynamic = 'force-dynamic';

/**
 * Taxi trip execution is intentionally separate from route planning.
 * Environments without the reviewed Taxi trip capability keep every trip
 * mutation hidden while still exposing the real Khedmah map-selection surface
 * for product review and safe route-planning UX validation.
 */
export default function TaxiRolloutLayout({ children }: { children: ReactNode }) {
  if (process.env.TAXI_TRIPS_ENABLED === 'true') return children;

  return <PageShell label="خدمة تكسي">
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
      <h2>ابحث عن مزود تكسي متاح</h2>
      <p>يمكنك استخدام البحث حسب الموقع للتواصل مباشرة مع مقدمي خدمة التكسي المعتمدين حاليًا.</p>
      <ActionLink href="/mobility?type=taxi">البحث عن تكسي قريب</ActionLink>
    </Surface>
  </PageShell>;
}
