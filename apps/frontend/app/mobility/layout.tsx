import type { ReactNode } from 'react';

export default function MobilityLayout({ children }: { children: ReactNode }) {
  return <div className="khedmah-section-identity" data-khedmah-section="mobility">{children}</div>;
}
