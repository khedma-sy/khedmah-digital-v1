'use client';

import { FormEvent, useState } from 'react';

export default function RegisterPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    window.setTimeout(() => {
      setIsLoading(false);
      setError('يرجى إدخال بيانات صحيحة لإكمال إنشاء الحساب.');
    }, 250);
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
          <input name="password" type="password" autoComplete="new-password" required minLength={12} />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="foundation-action" type="submit" aria-busy={isLoading} disabled={isLoading}>
          {isLoading ? 'جاري إنشاء الحساب...' : 'إنشاء الحساب'}
        </button>
      </form>
    </main>
  );
}
