'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { identityApi } from '../../../lib/identity-api';
import { IdentityVisual } from '../identity-visual';

export default function VerifyEmailPage() {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'idle' | 'confirming' | 'verified' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextEmail = params.get('email') ?? '';
    const nextToken = params.get('token') ?? '';
    setEmail(nextEmail);
    setToken(nextToken);
    if (nextToken) {
      setStatus('confirming');
      void identityApi.confirmEmailVerification(nextToken)
        .then((result) => {
          setEmail(result.email);
          setStatus('verified');
          setMessage('تم تأكيد بريدك الإلكتروني بنجاح. يمكنك الآن تسجيل الدخول.');
        })
        .catch((err) => {
          setStatus('error');
          setMessage(err instanceof Error ? err.message : 'تعذر تأكيد البريد الإلكتروني.');
        });
    }
  }, []);

  async function resend() {
    if (!email || resending) return;
    setResending(true);
    setMessage('');
    try {
      await identityApi.requestEmailVerification(email);
      setMessage('إذا كان الحساب بانتظار التحقق، أُرسلت رسالة تأكيد جديدة.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'تعذر إرسال رسالة التحقق الآن.');
    } finally {
      setResending(false);
    }
  }

  return (
    <main id="foundation-content" className="auth-experience" aria-label="تأكيد البريد الإلكتروني">
      <div className="auth-phone auth-phone-login">
        <IdentityVisual />
        <section className="auth-panel">
          <header className="auth-panel-title"><h1>تأكيد البريد الإلكتروني</h1></header>
          {status === 'confirming' ? <p>جاري التحقق من الرابط...</p> : null}
          {status === 'verified' ? (
            <>
              <p className="auth-success" role="status">{message}</p>
              <Link className="auth-primary" href="/auth/login">الانتقال إلى تسجيل الدخول</Link>
            </>
          ) : null}
          {status !== 'verified' ? (
            <>
              <p>أرسلنا رابط تأكيد إلى بريدك. افتح الرسالة واضغط على رابط التحقق لتفعيل الحساب.</p>
              {email ? <p><strong>{email}</strong></p> : null}
              {message ? <p className={status === 'error' ? 'auth-error' : ''} role="status">{message}</p> : null}
              {email ? <button className="auth-secondary" type="button" onClick={resend} disabled={resending}>{resending ? 'جاري الإرسال...' : 'إعادة إرسال رسالة التحقق'}</button> : null}
              <Link className="auth-secondary" href="/auth/login">العودة إلى تسجيل الدخول</Link>
            </>
          ) : null}
          {token && status === 'error' ? <p>يمكنك طلب رابط جديد باستخدام البريد المسجل.</p> : null}
        </section>
      </div>
    </main>
  );
}
