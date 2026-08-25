'use client';

import { FormEvent, useState } from 'react';

export default function ProfilePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setIsLoading(true);
    window.setTimeout(() => {
      setIsLoading(false);
      setMessage('تم تجهيز واجهة الملف الأساسي.');
    }, 250);
  }

  return (
    <main id="foundation-content" className="identity-shell" aria-label="الملف الأساسي">
      <form className="identity-card" onSubmit={submitProfile} noValidate>
        <p className="eyebrow">خدمة</p>
        <h1>الملف الأساسي</h1>
        <label>
          الاسم الظاهر
          <input name="displayName" type="text" required minLength={2} maxLength={80} />
        </label>
        {message ? <p className="form-success" role="status">{message}</p> : null}
        <button className="foundation-action" type="submit" aria-busy={isLoading} disabled={isLoading}>
          {isLoading ? 'جاري الحفظ...' : 'حفظ الملف'}
        </button>
      </form>
    </main>
  );
}
