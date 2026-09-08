'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicUserProfile } from '../lib/api-client';
import { PlatformIcon } from './components/platform-icon';

export function DiscoveryNavigation() {
  const pathname = usePathname();
  const links = [
    { href: '/search', label: 'اكتشف', active: pathname === '/search' },
    { href: '/categories', label: 'التصنيفات', active: pathname === '/categories' },
    { href: '/map', label: 'بالقرب مني', active: pathname === '/map' },
    { href: '/mobility', label: 'تاكسي وتوصيل', active: pathname === '/mobility' },
    { href: '/classifieds', label: 'الإعلانات', active: pathname.startsWith('/store') || pathname === '/classifieds' }
  ];
  return <nav className="nav-discovery-group" aria-label="أقسام خدمة">{links.map((link) => <Link key={link.href} href={link.href} className="nav-discovery" aria-current={link.active ? 'page' : undefined}>{link.label}</Link>)}</nav>;
}

export function AuthNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<PublicUserProfile | null>();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  useEffect(() => {
    let active = true;
    void api.auth.session()
      .then(({ user: currentUser }) => { if (active) setUser(currentUser); })
      .catch(() => { if (active) setUser(null); });
    return () => { active = false; };
  }, [pathname]);

  async function finishLoggedOutState() {
    setUser(null);
    setLogoutError('');
    router.replace('/');
  }

  async function logout() {
    setIsLoggingOut(true);
    setLogoutError('');
    try {
      await api.auth.logout();
      await finishLoggedOutState();
    } catch {
      try {
        await api.auth.session();
        setLogoutError('تعذر إنهاء الجلسة بأمان. حاول تسجيل الخروج مرة أخرى.');
      } catch (sessionError) {
        const status = sessionError instanceof Error ? (sessionError as Error & { statusCode?: number }).statusCode : undefined;
        if (status === 401) await finishLoggedOutState();
        else setLogoutError('تعذر التحقق من حالة الجلسة. تحقق من الاتصال ثم حاول مرة أخرى.');
      }
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (user === undefined) return <span className="nav-auth-loading" aria-label="جاري تحميل الحساب" aria-busy="true" />;

  if (user === null) {
    return <div className="nav-session" data-auth-state="guest">
      <Link href="/auth/login" className="nav-cta"><PlatformIcon name="lock" size={17}/>دخول</Link>
      <Link href="/auth/register" className="nav-register"><PlatformIcon name="userPlus" size={17}/>إنشاء حساب</Link>
    </div>;
  }

  return <div className="nav-session" data-auth-state="authenticated">
    <Link href="/business-profiles">أعمالي</Link>
    <Link href="/users/me" className="nav-cta nav-user" aria-label="الملف الشخصي">{user.profile.displayName}</Link>
    <button className="nav-logout" type="button" onClick={logout} disabled={isLoggingOut} aria-busy={isLoggingOut}><PlatformIcon name="logout" size={17}/>{isLoggingOut ? 'جاري الخروج...' : 'تسجيل الخروج'}</button>
    {logoutError ? <span className="nav-action-error" role="alert">{logoutError}</span> : null}
  </div>;
}
