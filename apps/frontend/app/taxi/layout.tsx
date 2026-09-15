import type { ReactNode } from 'react';
import { ActionLink, PageHeader, PageShell, Surface } from '../components/ui-primitives';
import { TaxiPlanningPreview } from './taxi-planning-preview';
import styles from './taxi.module.css';

export const dynamic = 'force-dynamic';

/**
 * Taxi trip execution is intentionally separate from driver onboarding.
 * Driver registration/document review remains available even while trip
 * mutations stay fail-closed behind the reviewed rollout gate.
 */
export default function TaxiRolloutLayout({ children }: { children: ReactNode }) {
  if (process.env.TAXI_TRIPS_ENABLED === 'true') {
    return <div className="khedmah-section-identity" data-khedmah-section="taxi">{children}</div>;
  }

  return <div className="khedmah-section-identity" data-khedmah-section="taxi">
    <PageShell className={styles.page} label="خدمة تكسي">
      <PageHeader
        eyebrow="خدمة — التنقل"
        title="خدمة تكسي"
        description="خطّط لمسارك أو ابحث عن مزود تكسي للتواصل معه. حجز الرحلات داخل خدمة غير متاح حاليًا."
        backHref="/"
      />
      <Surface className={styles.panel}>
        <TaxiPlanningPreview />
      </Surface>
      <div className={styles.grid}>
      <Surface className={styles.panel}>
        <h2>تحتاج تكسي الآن؟</h2>
        <p className={styles.note}>ابحث حسب الموقع وتواصل مع مزود تكسي لتأكيد التوفر والسعر. البحث لا ينشئ حجزًا.</p>
        <ActionLink href="/mobility?type=taxi">البحث عن تكسي قريب</ActionLink>
      </Surface>
      <Surface className={styles.panel}>
        <h2>لديك سيارة؟ انضم إلى خدمة تكسي</h2>
        <p className={styles.note}>أنشئ ملفك وجهّز الوثائق الأربع لتراجعها خدمة قبل اعتماد السائق والسيارة والمنطقة.</p>
        <ActionLink href="/taxi-driver-signup" variant="secondary">سجّل سيارتك مع خدمة</ActionLink>
      </Surface>
      </div>
    </PageShell>
  </div>;
}
