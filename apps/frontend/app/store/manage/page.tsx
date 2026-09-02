'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type ProductListing } from '../../../lib/api-client';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import { PlatformIcon } from '../../components/platform-icon';
import styles from '../store.module.css';

const status = (product: ProductListing) => product.status === 'inactive' ? 'غير نشط' : product.moderationStatus === 'approved'
  ? 'منشور'
  : product.moderationStatus === 'rejected'
    ? 'مطلوب تعديل'
    : product.status === 'draft' ? 'مسودة' : 'قيد المراجعة';

export default function ManageProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workingId, setWorkingId] = useState('');

  async function deactivate(product: ProductListing) {
    setWorkingId(product.id); setError('');
    try { const result = await api.products.deactivate(product.id); setProducts((items) => items.map((item) => item.id === product.id ? result.product : item)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إلغاء نشر الإعلان.'); }
    finally { setWorkingId(''); }
  }

  useEffect(() => {
    let active = true;
    void api.products.listMine()
      .then(({ products: items }) => { if (active) setProducts(items); })
      .catch((cause) => {
        const code = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
        if (code === 401) router.replace('/auth/login?next=%2Fstore%2Fmanage');
        else setError('تعذر تحميل منتجاتك.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  return <PageShell className={styles.page} label="منتجاتي">
    <PageHeader eyebrow="مساحة البائع" title="منتجاتي" description="تابع المسودات والمراجعة والمنتجات المنشورة من مكان واحد." actions={<ActionLink href="/store/sell">عرض منتج للبيع</ActionLink>}/>
    {error && <StatusMessage tone="danger">{error}</StatusMessage>}
    {loading ? <SkeletonGrid count={4}/> : products.length ? <section className={styles.grid}>
      {products.map((product) => <Surface as="article" className={styles.card} key={product.id}>
        <div className={styles.image}>{product.imageUrl ? <img src={product.imageUrl} alt={product.titleAr}/> : <span>خ</span>}</div>
        <span className={styles.status}>{status(product)}</span>
        <h2>{product.titleAr}</h2>
        <strong className={styles.price}>{product.price.toLocaleString('ar-SY')} {product.currency}</strong>
        {product.rejectionReason && <StatusMessage tone="danger">{product.rejectionReason}</StatusMessage>}
        <div className={styles.actions}>
          <ActionLink href={`/store/manage/${product.id}/edit`} variant="secondary">تعديل المنتج</ActionLink>
          {product.moderationStatus === 'approved' && <ActionLink href={`/store/products/${product.id}`}>عرض الصفحة العامة</ActionLink>}
          {product.status !== 'inactive' && <ActionButton type="button" variant="secondary" disabled={workingId === product.id} onClick={() => void deactivate(product)}>{workingId === product.id ? 'جارٍ الإلغاء…' : 'إلغاء نشر الإعلان'}</ActionButton>}
        </div>
      </Surface>)}
    </section> : <EmptyState icon={<PlatformIcon name="briefcase" size={34}/>} title="لم تضف منتجات بعد" description="ابدأ بمنتج مرتبط بأحد أنشطتك." actions={<ActionLink href="/store/sell">عرض أول منتج</ActionLink>}/>} 
  </PageShell>;
}
