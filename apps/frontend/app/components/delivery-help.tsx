import { ActionLink, Surface } from './ui-primitives';
import { PlatformIcon } from './platform-icon';

type DeliveryHelpProps = {
  mode: 'order' | 'independent';
};

export function DeliveryHelp({ mode }: DeliveryHelpProps) {
  const order = mode === 'order';
  return <Surface as="aside" aria-label="مساعدة مندوب التوصيل">
    <h2>هل تحتاج مندوب توصيل؟</h2>
    <p>
      {order
        ? 'في الطلبات التي تمر عبر خدمة لا تحتاج لترتيب مندوب خارج الطلب. بعد اعتماد رسوم التوصيل وموافقتك على الإجمالي، يربط مقدم الطلب المهمة بمندوب توصيل معتمد في خدمة.'
        : 'بعد الاتفاق مع مقدم الإعلان على السلعة أو الاستلام، يمكنك البحث بشكل مستقل عن مندوب توصيل معتمد قريب. هذا لا ينشئ دفعة أو طلب شراء داخل الإعلانات.'}
    </p>
    <div className="ui-page-actions">
      {order
        ? <ActionLink href="/orders" variant="secondary"><PlatformIcon name="delivery" size={17}/>متابعة الطلب والمندوب</ActionLink>
        : <ActionLink href="/mobility?type=delivery"><PlatformIcon name="delivery" size={17}/>ابحث عن مندوب توصيل قريب</ActionLink>}
      {order && <ActionLink href="/mobility?type=delivery" variant="quiet">أحتاج توصيلًا مستقلًا</ActionLink>}
    </div>
  </Surface>;
}
