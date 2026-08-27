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
  const [existing, setExisting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextEmail = params.get('email') ?? '';
    const nextToken = params.get('token') ?? '';
    setExisting(params.get('existing') === '1');
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
          <header className="auth-panel-title">
            <span className={`auth-status-icon ${status === 'verified' ? '' : 'auth-status-waiting'}`} aria-hidden="true">{status === 'verified' ? '✓' : '✉'}</span>
            <h1>{status === 'verified' ? 'تم تأكيد البريد' : 'أكد بريدك الإلكتروني'}</h1>
            <p>{status === 'confirming' ? 'نتحقق من الرابط الآمن الآن…' : status === 'verified' ? 'أصبح حسابك جاهزًا للاستخدام.' : 'بقيت خطوة واحدة لتفعيل حسابك في خدمة.'}</p>
          </header>
          {status === 'confirming' ? <p className="auth-notice" role="status">جاري التحقق من الرابط...</p> : null}
          {status === 'verified' ? (
            <>
              <p className="auth-success" role="status">{message}</p>
              <Link className="auth-primary" href="/auth/login">الانتقال إلى تسجيل الدخول</Link>
            </>
          ) : null}
          {status !== 'verified' ? (
            <>
              <p>{existing ? 'هذا البريد مسجل مسبقًا. إذا كان الحساب بانتظار التفعيل، اطلب رسالة تحقق جديدة.' : 'أرسلنا رابط تأكيد إلى بريدك. افتح الرسالة واضغط زر «تأكيد البريد الإلكتروني» لتفعيل الحساب.'}</p>
              {email ? <p><strong>{email}</strong></p> : null}
              {message ? <p className={status === 'error' ? 'auth-error' : ''} role="status">{message}</p> : null}
              {email ? <button className="auth-resend" type="button" onClick={resend} disabled={resending}>{resending ? 'جاري الإرسال...' : 'إرسال رابط تحقق جديد'}</button> : null}
              <Link className="auth-secondary" href="/auth/login">العودة إلى تسجيل الدخول</Link>
            </>
          ) : null}
          {token && status === 'error' ? <p>يمكنك طلب رابط جديد باستخدام البريد المسجل.</p> : null}
        </section>
      </div>
    </main>
  );
}
