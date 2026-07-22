'use client';

import { FormEvent, useState } from 'react';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    window.setTimeout(() => {
      setIsLoading(false);
      setError('تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور.');
    }, 250);
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
          <input name="password" type="password" autoComplete="current-password" required minLength={12} />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="foundation-action" type="submit" aria-busy={isLoading} disabled={isLoading}>
          {isLoading ? 'جاري الدخول...' : 'دخول'}
        </button>
      </form>
    </main>
  );
}
