'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { productionAuth } from '../../../lib/auth-production';
import { IdentityVisual } from '../identity-visual';

export default function VerifyEmailPage() {
  const search = useSearchParams();
  const token = search.get('token') ?? '';
  const email = search.get('email') ?? '';
  const [state, setState] = useState<'waiting' | 'verifying' | 'success' | 'error'>(token ? 'verifying' : 'waiting');
  const [message, setMessage] = useState(token ? 'جاري تأكيد بريدك الإلكتروني...' : 'أرسلنا رابط التأكيد إلى بريدك الإلكتروني.');
  const [resending, setResending] = useState(false);

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

  async function resend() {
    if (!email || resending) return;
    setResending(true);
    try {
      await productionAuth.resendVerification(email);
      setMessage('إذا كان الحساب بانتظار التأكيد فقد أرسلنا رسالة جديدة. تحقق من بريدك.');
      setState('waiting');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'تعذر إعادة إرسال رسالة التأكيد.');
      setState('error');
    } finally {
      setResending(false);
    }
  }

  return (
    <main id="foundation-content" className="auth-experience" aria-label="تأكيد البريد الإلكتروني">
      <div className="auth-phone auth-phone-login">
        <IdentityVisual />
        <section className="auth-panel">
          <h1>تأكيد البريد الإلكتروني</h1>
          <p role={state === 'error' ? 'alert' : 'status'}>{message}</p>
          {state === 'success' ? <Link className="auth-primary" href="/auth/login">تسجيل الدخول</Link> : null}
          {!token && email ? <button className="auth-secondary" type="button" onClick={resend} disabled={resending}>{resending ? 'جاري إعادة الإرسال...' : 'إعادة إرسال رسالة التأكيد'}</button> : null}
          {state !== 'verifying' && state !== 'success' ? <Link className="auth-secondary" href="/auth/login">العودة إلى تسجيل الدخول</Link> : null}
        </section>
      </div>
    </main>
  );
}
