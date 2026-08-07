'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api } from '../../../lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    const form = event.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;

    try {
      await api.auth.login(email, password);
      router.push('/organizations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main id="foundation-content" className="identity-shell" aria-label="تسجيل الدخول">
      <form className="identity-card" onSubmit={submitLogin} noValidate>
        <p className="eyebrow">Khedmah Digital V1</p>
        <h1>تسجيل الدخول</h1>
        <label>
          البريد الإلكتروني
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          كلمة المرور
          <input name="password" type="password" autoComplete="current-password" required minLength={8} />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="foundation-action" type="submit" aria-busy={isLoading} disabled={isLoading}>
          {isLoading ? 'جاري الدخول...' : 'دخول'}
        </button>
        <p style={{ marginTop: '1rem', textAlign: 'center' }}>
          ليس لديك حساب؟{' '}
          <Link href="/auth/register">إنشاء حساب</Link>
        </p>
      </form>
    </main>
  );
}
