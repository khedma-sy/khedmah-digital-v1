import type { ReactNode } from 'react';

export default function MapLayout({ children }: { children: ReactNode }) {
  return <div className="khedmah-section-identity" data-khedmah-section="nearby">{children}</div>;
}
