import type { ReactNode } from 'react';

export default function SearchLayout({ children }: { children: ReactNode }) {
  return <div className="khedmah-section-identity" data-khedmah-section="discovery">{children}</div>;
}
