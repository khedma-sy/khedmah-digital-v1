'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, PublicUserProfile } from '../lib/api-client';
import { PlatformIcon } from './components/platform-icon';

export function DiscoveryNavigation() {
  const pathname = usePathname();
  const links = [
    { href: '/search', label: 'اكتشف', active: pathname === '/search' },
    { href: '/categories', label: 'التصنيفات', active: pathname === '/categories' },
    { href: '/map', label: 'بالقرب مني', active: pathname === '/map' },
    { href: '/mobility', label: 'تاكسي وتوصيل', active: pathname === '/mobility' || pathname === '/taxi' },
    { href: '/classifieds', label: 'الإعلانات', active: pathname.startsWith('/store') || pathname === '/classifieds' }
  ];
  return <nav className="nav-discovery-group" aria-label="أقسام خدمة ديجتل">{links.map((link) => <Link key={link.href} href={link.href} className="nav-discovery" aria-current={link.active ? 'page' : undefined}>{link.label}</Link>)}</nav>;
}

export function AuthNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<PublicUserProfile | null>();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const sessionSequence = useRef(0);
  const lifecycle = useRef(0);
  const logoutInProgress = useRef(false);

  useEffect(() => {
    lifecycle.current += 1;
    return () => { lifecycle.current += 1; };
  }, []);

  useEffect(() => {
    const request = ++sessionSequence.current;
    if (logoutInProgress.current) return;
    setSessionError('');
    void api.auth.session()
      .then(({ user: currentUser }) => { if (request === sessionSequence.current) setUser(currentUser); })
      .catch((cause) => {
        if (request !== sessionSequence.current) return;
        const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
        if (status === 401) setUser(null);
        else setSessionError('تعذر التحقق من الحساب. تحقق من الاتصال ثم أعد المحاولة.');
      });
    return () => { sessionSequence.current += 1; };
  }, [pathname, retryCount]);

  function finishLoggedOutState() {
    sessionSequence.current += 1;
    setUser(null);
    setLogoutError('');
    setSessionError('');
    router.replace('/');
  }

  async function logout() {
    if (logoutInProgress.current) return;
    logoutInProgress.current = true;
    sessionSequence.current += 1;
    const generation = lifecycle.current;
    const active = () => generation === lifecycle.current;
    setIsLoggingOut(true);
    setLogoutError('');
    try {
      await api.auth.logout();
      if (active()) finishLoggedOutState();
    } catch {
      if (!active()) return;
      try {
        await api.auth.session();
        if (active()) setLogoutError('تعذر إنهاء الجلسة بأمان. حاول تسجيل الخروج مرة أخرى.');
      } catch (sessionError) {
        if (!active()) return;
        const status = sessionError instanceof Error ? (sessionError as Error & { statusCode?: number }).statusCode : undefined;
        if (status === 401) finishLoggedOutState();
        else setLogoutError('تعذر التحقق من حالة الجلسة. تحقق من الاتصال ثم حاول مرة أخرى.');
      }
    } finally {
      if (active()) {
        logoutInProgress.current = false;
        setIsLoggingOut(false);
      }
    }
  }

  const sessionRecovery = sessionError ? <span className="nav-action-error" role="alert">{sessionError} <button className="nav-logout" type="button" disabled={isLoggingOut} onClick={() => setRetryCount((value) => value + 1)}>إعادة المحاولة</button></span> : null;
  if (user === undefined && sessionError) return <div className="nav-session" data-auth-state="unknown">{sessionRecovery}</div>;
  if (user === undefined) return <span className="nav-auth-loading" aria-label="جاري تحميل الحساب" aria-busy="true" />;

  if (user === null) {
    return <div className="nav-session" data-auth-state="guest">
      <Link href="/auth/login" className="nav-cta"><PlatformIcon name="lock" size={17}/>دخول</Link>
      <Link href="/auth/register" className="nav-register"><PlatformIcon name="userPlus" size={17}/>إنشاء حساب</Link>
      {sessionRecovery}
    </div>;
  }

  return <div className="nav-session" data-auth-state="authenticated">
    <Link href="/business-profiles">أعمالي</Link>
    <Link href="/users/me" className="nav-cta nav-user" aria-label="الملف الشخصي">{user.profile.displayName}</Link>
    <button className="nav-logout" type="button" onClick={logout} disabled={isLoggingOut} aria-busy={isLoggingOut}><PlatformIcon name="logout" size={17}/>{isLoggingOut ? 'جاري الخروج...' : 'تسجيل الخروج'}</button>
    {logoutError ? <span className="nav-action-error" role="alert">{logoutError}</span> : null}
    {sessionRecovery}
  </div>;
}
