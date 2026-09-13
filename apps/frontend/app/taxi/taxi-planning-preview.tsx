'use client';

import { useState } from 'react';
import type { TaxiAddress } from '../../lib/taxi-client';
import { TaxiMapSelector } from './taxi-map-selector';
import styles from './taxi.module.css';

const initialPickup: TaxiAddress = { area: '', detail: '', latitude: 33.5138, longitude: 36.2765 };
const initialDropoff: TaxiAddress = { area: '', detail: '', latitude: 33.5, longitude: 36.3 };
const coordinate = (value: number) => Number.isFinite(value) ? value.toFixed(5) : '—';

/**
 * Read-only route-planning surface for environments where Taxi trip execution
 * remains deliberately disabled. This component never calls the Taxi API and
 * cannot create, mutate, accept, start, cancel, or complete a trip.
 */
export function TaxiPlanningPreview() {
  const [pickup, setPickup] = useState<TaxiAddress>(initialPickup);
  const [dropoff, setDropoff] = useState<TaxiAddress>(initialDropoff);

  return <section className={styles.panel} data-taxi-planning-preview data-taxi-trip-execution="disabled">
    <h2>تخطيط مسار الرحلة</h2>
    <p className={styles.note}>اختر نقطة الانطلاق والوجهة على الخريطة لمراجعة تجربة التخطيط. تنفيذ الرحلات والتسعير والطلبات التشغيلية ما زالت معطلة في هذه البيئة.</p>
    <TaxiMapSelector pickup={pickup} dropoff={dropoff} onPickupChange={setPickup} onDropoffChange={setDropoff} />
    <div className={styles.summary} aria-label="إحداثيات مسار المعاينة">
      <dl>
        <div><dt>الانطلاق</dt><dd>{coordinate(pickup.latitude)}, {coordinate(pickup.longitude)}</dd></div>
        <div><dt>الوجهة</dt><dd>{coordinate(dropoff.latitude)}, {coordinate(dropoff.longitude)}</dd></div>
      </dl>
    </div>
  </section>;
}
