'use client';

import { useState } from 'react';

const exampleOrganizations = ['مؤسسة النمو الرقمي', 'شركة الخدمات الحديثة'];

export default function OrganizationsPage() {
  const [isLoading, setIsLoading] = useState(false);

  function refreshOrganizations() {
    setIsLoading(true);
    window.setTimeout(() => setIsLoading(false), 250);
  }

  return (
    <main id="foundation-content" className="identity-shell" aria-label="منظماتي">
      <section className="identity-card">
        <p className="eyebrow">Khedmah Digital V1</p>
        <h1>منظماتي</h1>
        <p>إدارة أساس الملكية والعضوية للمنظمات فقط.</p>
        <button className="foundation-action" type="button" aria-busy={isLoading} disabled={isLoading} onClick={refreshOrganizations}>
          {isLoading ? 'جاري التحديث...' : 'تحديث القائمة'}
        </button>
        <ul className="foundation-list" aria-label="قائمة المنظمات">
          {exampleOrganizations.map((organization) => (
            <li key={organization}>{organization}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
