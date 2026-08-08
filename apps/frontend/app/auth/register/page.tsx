'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api } from '../../../lib/api-client';
import { provinces } from '../../../lib/platform-data';

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
    const city = (form.elements.namedItem('city') as HTMLSelectElement).value;

    try {
      await api.auth.register(email, password, displayName);
      const province = provinces.find(({ slug }) => slug === city);
      sessionStorage.setItem('khedmah.welcome', JSON.stringify({ cityName: province?.name ?? '' }));
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
        <label>
          محافظتك
          <select name="city" required defaultValue="">
            <option value="" disabled>اختر المحافظة</option>
            {provinces.map((province) => <option value={province.slug} key={province.slug}>{province.name}</option>)}
          </select>
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
