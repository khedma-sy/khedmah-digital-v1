'use client';

import { FormEvent, useState } from 'react';

export default function CreateOrganizationPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    window.setTimeout(() => {
      setIsLoading(false);
      setError('يرجى إدخال اسم منظمة صحيح.');
    }, 250);
  }

  return (
    <main id="foundation-content" className="identity-shell" aria-label="إنشاء منظمة">
      <form className="identity-card" onSubmit={createOrganization} noValidate>
        <p className="eyebrow">Khedmah Digital V1</p>
        <h1>إنشاء منظمة</h1>
        <label>
          اسم المنظمة
          <input name="name" type="text" required minLength={2} maxLength={120} />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="foundation-action" type="submit" aria-busy={isLoading} disabled={isLoading}>
          {isLoading ? 'جاري الإنشاء...' : 'إنشاء المنظمة'}
        </button>
      </form>
    </main>
  );
}
