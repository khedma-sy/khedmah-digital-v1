import { Fragment } from 'react';
import type { Category } from '../../lib/api-client';

export function CategorySelectOptions({ categories, allowRoots = true }: { categories: Category[]; allowRoots?: boolean }) {
  const roots = categories.filter((category) => !category.parentCode);
  const groupedCodes = new Set<string>();

  const groups = roots.map((root) => {
    const children = categories.filter((category) => category.parentCode === root.code);
    groupedCodes.add(root.code);
    children.forEach((child) => groupedCodes.add(child.code));
    if (children.length === 0) {
      return allowRoots ? <option key={root.code} value={root.code}>{root.nameAr}</option> : null;
    }
    return <Fragment key={root.code}>
      {allowRoots ? <option value={root.code}>{root.nameAr} — كل التصنيف</option> : null}
      <optgroup label={root.nameAr}>
        {children.map((child) => <option key={child.code} value={child.code}>{child.nameAr}</option>)}
      </optgroup>
    </Fragment>;
  });

  const ungrouped = categories.filter((category) => !groupedCodes.has(category.code));
  return <>{groups}{ungrouped.filter((category) => allowRoots || category.parentCode).map((category) => <option key={category.code} value={category.code}>{category.nameAr}</option>)}</>;
}
