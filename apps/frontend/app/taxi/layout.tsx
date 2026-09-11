import type { ReactNode } from 'react';
import { ActionLink, PageHeader, PageShell, Surface } from '../components/ui-primitives';

export const dynamic = 'force-dynamic';

/**
 * Taxi trip execution is intentionally separate from provider discovery.
 * The operational UI must stay hidden unless the server runtime explicitly
 * enables the reviewed Taxi trip capability for this environment.
 */
export default function TaxiRolloutLayout({ children }: { children: ReactNode }) {
  if (process.env.TAXI_TRIPS_ENABLED === 'true') return children;

  return <PageShell label="خدمة تكسي">
    <PageHeader
      eyebrow="خدمة — التنقل"
      title="خدمة تكسي"
      description="الرحلات التشغيلية غير مفعلة في هذه البيئة حاليًا."
      backHref="/"
    />
    <Surface>
      <h2>ابحث عن مزود تكسي متاح</h2>
      <p>يمكنك استخدام البحث حسب الموقع للتواصل مباشرة مع مقدمي خدمة التكسي المعتمدين حاليًا.</p>
      <ActionLink href="/mobility?type=taxi">البحث عن تكسي قريب</ActionLink>
    </Surface>
  </PageShell>;
}
