import type { ReactNode } from 'react';

export default function FoodLayout({ children }: { children: ReactNode }) {
  return <div className="khedmah-section-identity" data-khedmah-section="food">{children}</div>;
}
