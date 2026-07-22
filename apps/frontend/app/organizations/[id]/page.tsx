'use client';

import { FormEvent, useState } from 'react';

export default function OrganizationDetailsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  function updateOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setIsLoading(true);
    window.setTimeout(() => {
      setIsLoading(false);
      setMessage('تم تجهيز تحديث بيانات المنظمة.');
    }, 250);
  }

  return (
    <main id="foundation-content" className="identity-shell" aria-label="تفاصيل المنظمة">
      <form className="identity-card" onSubmit={updateOrganization} noValidate>
        <p className="eyebrow">Khedmah Digital V1</p>
        <h1>تفاصيل المنظمة</h1>
        <label>
          اسم المنظمة
          <input name="name" type="text" required minLength={2} maxLength={120} />
        </label>
        <section className="member-panel" aria-label="أساس العضوية">
          <h2>الأعضاء</h2>
          <p>إدارة العضوية الأساسية دون أي ميزات تجارية أو اكتشاف.</p>
        </section>
        {message ? <p className="form-success" role="status">{message}</p> : null}
        <button className="foundation-action" type="submit" aria-busy={isLoading} disabled={isLoading}>
          {isLoading ? 'جاري الحفظ...' : 'حفظ المنظمة'}
        </button>
      </form>
    </main>
  );
}
