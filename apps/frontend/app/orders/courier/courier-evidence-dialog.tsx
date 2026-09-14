'use client';

import type { FulfillmentOrder } from '../../../lib/recovered-service-client';

type Props = {
  readonly order: FulfillmentOrder;
  readonly status: 'picked_up' | 'delivered';
  readonly saving: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
};

export function CourierEvidenceDialog({ order, status, saving, onCancel, onConfirm }: Props) {
  const pickup = status === 'picked_up';
  const amount = order.total === undefined
    ? 'المبلغ الظاهر في المهمة'
    : `${order.total.toLocaleString('ar-SY-u-nu-latn')} ${order.currency}`;

  return <div className="moderation-dialog-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.currentTarget === event.target && !saving) onCancel();
  }}>
    <section className="moderation-dialog" role="dialog" aria-modal="true" aria-labelledby="courier-evidence-dialog-title">
      <h3 id="courier-evidence-dialog-title">{pickup ? 'تأكيد استلام الطلب' : 'تأكيد التسليم والتحصيل'}</h3>
      <p>{pickup
        ? 'أكد فقط بعد استلام الطلب كاملًا فعليًا من المنشأة. سينتقل الطلب بعدها إلى حالة «في الطريق».'
        : `أكد فقط بعد تسليم الطلب للعميل وتحصيل ${amount}. سيُغلق الطلب بعد هذا القرار.`}</p>
      <div className="moderation-actions">
        <button type="button" disabled={saving} onClick={onCancel}>إلغاء</button>
        <button type="button" className="moderation-approve" disabled={saving} onClick={onConfirm}>
          {saving ? 'جارٍ الحفظ…' : pickup ? 'أؤكد أنني استلمت الطلب' : 'أؤكد التسليم والتحصيل'}
        </button>
      </div>
    </section>
  </div>;
}
