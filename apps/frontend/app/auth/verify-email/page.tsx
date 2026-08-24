'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { productionAuth } from '../../../lib/auth-production';
import { IdentityVisual } from '../identity-visual';

export default function VerifyEmailPage() {
  const search = useSearchParams();
  const token = search.get('token') ?? '';
  const [state, setState] = useState<'waiting' | 'verifying' | 'success' | 'error'>(token ? 'verifying' : 'waiting');
  const [message, setMessage] = useState(token ? 'جاري تأكيد بريدك الإلكتروني...' : 'أرسلنا رابط التأكيد إلى بريدك الإلكتروني.');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void productionAuth.confirmEmail(token)
      .then(() => {
        if (!cancelled) {
          setState('success');
          setMessage('تم تأكيد بريدك الإلكتروني بنجاح. يمكنك تسجيل الدخول الآن.');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState('error');
          setMessage(err instanceof Error ? err.message : 'تعذر تأكيد البريد الإلكتروني.');
        }
      });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <main id="foundation-content" className="auth-experience" aria-label="تأكيد البريد الإلكتروني">
      <div className="auth-phone auth-phone-login">
        <IdentityVisual />
        <section className="auth-panel">
          <h1>تأكيد البريد الإلكتروني</h1>
          <p role={state === 'error' ? 'alert' : 'status'}>{message}</p>
          {state === 'success' ? <Link className="auth-primary" href="/auth/login">تسجيل الدخول</Link> : null}
          {state === 'waiting' ? <Link className="auth-secondary" href="/auth/login">العودة إلى تسجيل الدخول</Link> : null}
        </section>
      </div>
    </main>
  );
}
