'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api } from '../../../lib/api-client';

export default function CreateOrganizationPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    const form = event.currentTarget;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;

    try {
      await api.organizations.create(name);
      router.push('/organizations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'يرجى إدخال اسم منظمة صحيح.');
    } finally {
      setIsLoading(false);
    }
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
        <p style={{ marginTop: '1rem', textAlign: 'center' }}>
          <Link href="/organizations">العودة إلى منظماتي</Link>
        </p>
      </form>
    </main>
  );
}
