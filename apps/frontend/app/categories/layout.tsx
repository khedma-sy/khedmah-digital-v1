import type { ReactNode } from 'react';

export default function CategoriesLayout({ children }: { children: ReactNode }) {
  return <div className="khedmah-section-identity" data-khedmah-section="categories">{children}</div>;
}
