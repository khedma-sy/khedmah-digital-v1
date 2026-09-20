import type { ReactNode } from 'react';

export default function StoreLayout({ children }: { children: ReactNode }) {
  return <div className="khedmah-section-identity" data-khedmah-section="store">{children}</div>;
}
