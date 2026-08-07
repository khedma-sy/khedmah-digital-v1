'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api } from '../../../lib/api-client';

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    const form = event.currentTarget;
    const displayName = (form.elements.namedItem('displayName') as HTMLInputElement).value;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;

    try {
      await api.auth.register(email, password, displayName);
      router.push('/welcome');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'يرجى إدخال بيانات صحيحة لإكمال إنشاء الحساب.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main id="foundation-content" className="identity-shell" aria-label="إنشاء حساب">
      <form className="identity-card" onSubmit={submitRegistration} noValidate>
        <p className="eyebrow">Khedmah Digital V1</p>
        <h1>إنشاء حساب</h1>
        <label>
          الاسم الظاهر
          <input name="displayName" type="text" autoComplete="name" required minLength={2} maxLength={80} />
        </label>
        <label>
          البريد الإلكتروني
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          كلمة المرور
          <input name="password" type="password" autoComplete="new-password" required minLength={8} />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="foundation-action" type="submit" aria-busy={isLoading} disabled={isLoading}>
          {isLoading ? 'جاري إنشاء الحساب...' : 'إنشاء الحساب'}
        </button>
        <p style={{ marginTop: '1rem', textAlign: 'center' }}>
          لديك حساب بالفعل؟{' '}
          <Link href="/auth/login">تسجيل الدخول</Link>
        </p>
      </form>
    </main>
  );
}
