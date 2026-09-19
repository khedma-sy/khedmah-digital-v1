import type { ReactNode } from 'react';

export default function ClassifiedsLayout({ children }: { children: ReactNode }) {
  return <div className="khedmah-section-identity" data-khedmah-section="classifieds">{children}</div>;
}
