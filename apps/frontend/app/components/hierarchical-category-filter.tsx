'use client';

import { useMemo } from 'react';
import type { Category } from '../../lib/api-client';

export function HierarchicalCategoryFilter({ categories, value, disabled, onChange }: { categories: Category[]; value: string; disabled?: boolean; onChange(value: string): void }) {
  const roots = useMemo(() => categories.filter((category) => !category.parentCode), [categories]);
  const selected = categories.find((category) => category.code === value);
  const rootCode = selected?.parentCode ?? selected?.code ?? '';
  const root = roots.find((category) => category.code === rootCode);
  const children = useMemo(() => categories.filter((category) => category.parentCode === rootCode), [categories, rootCode]);

  return <div className="hierarchical-category" aria-label="اختيار التصنيف والتخصص">
    <label><span>المجال</span><select value={rootCode} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">كل المجالات</option>{roots.map((category) => <option key={category.code} value={category.code}>{category.nameAr}</option>)}</select></label>
    <label><span>التخصص</span><select value={selected?.parentCode ? selected.code : ''} disabled={disabled || !rootCode || children.length === 0} onChange={(event) => onChange(event.target.value || rootCode)}><option value="">{root ? `كل ${root.nameAr}` : 'اختر المجال أولًا'}</option>{children.map((category) => <option key={category.code} value={category.code}>{category.nameAr}</option>)}</select></label>
  </div>;
}
