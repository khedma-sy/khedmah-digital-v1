import { Suspense } from 'react';
import { CategoryDirectory } from '../components/category-directory';
import { PageShell, SkeletonGrid } from '../components/ui-primitives';

export default function CategoriesPage() {
  return <Suspense fallback={<PageShell label="دليل الخدمات" className="catalog-experience"><SkeletonGrid label="جاري تحميل الخدمات" /></PageShell>}><CategoryDirectory /></Suspense>;
}
