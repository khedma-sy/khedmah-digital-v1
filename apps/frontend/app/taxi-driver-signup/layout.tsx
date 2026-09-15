import type { ReactNode } from 'react';

export default function TaxiDriverSignupLayout({ children }: { children: ReactNode }) {
  return <div className="khedmah-section-identity" data-khedmah-section="taxi">{children}</div>;
}
