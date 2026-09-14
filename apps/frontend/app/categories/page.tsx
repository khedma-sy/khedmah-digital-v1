import { Suspense } from 'react';
import { CategoryDirectory } from '../components/category-directory';
import { PageShell, SkeletonGrid } from '../components/ui-primitives';
import styles from './categories.module.css';

export default function CategoriesPage() {
  return <div className={styles.toneScope}><Suspense fallback={<PageShell label="دليل الخدمات" className="catalog-experience"><SkeletonGrid label="جاري تحميل الخدمات" /></PageShell>}><CategoryDirectory /></Suspense></div>;
}
