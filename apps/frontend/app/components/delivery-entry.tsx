import Link from 'next/link';
import { PlatformIcon } from './platform-icon';
import styles from './delivery-entry.module.css';

export function DeliveryEntry(){
  return <aside className={styles.entry} aria-label="خدمات مندوب التوصيل">
    <details>
      <summary><PlatformIcon name="delivery" size={19}/><span>هل تحتاج مندوب توصيل؟</span></summary>
      <div className={styles.body}>
        <p>اختر توصيلًا مستقلًا، أو تابع المندوب المرتبط بطلبك. يعيّن المطعم المندوب بعد موافقتك على الإجمالي ورسوم التوصيل.</p>
        <nav aria-label="اختر رحلة التوصيل"><Link href="/mobility?type=delivery">البحث عن مندوب</Link><Link href="/orders">متابعة طلبي والمندوب</Link><Link href="/orders/merchant">ربط طلبات مطعمي بالمندوب</Link><Link href="/orders/courier">مهامي كمندوب</Link><Link href="/courier-signup">التسجيل كمندوب توصيل</Link></nav>
      </div>
    </details>
  </aside>;
}
