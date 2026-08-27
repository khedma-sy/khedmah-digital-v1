'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicUserProfile } from '../lib/api-client';
import { PlatformIcon } from './components/platform-icon';

function DiscoveryLinks({ pathname }: { pathname: string }) {
  const links = [
    { href: '/search', label: 'اكتشف', active: pathname === '/search' },
    { href: '/categories', label: 'التصنيفات', active: pathname === '/categories' },
    { href: '/map', label: 'بالقرب مني', active: pathname === '/map' }
  ];
  return (
    <>
      {links.map((link) => <Link key={link.href} href={link.href} className="nav-discovery" aria-current={link.active ? 'page' : undefined}>{link.label}</Link>)}
    </>
  );
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
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser);
      })
      .catch(() => {
        if (active) setUser(null);
      });

    return () => {
      active = false;
    };
  }, [pathname]);

  async function logout() {
    setIsLoggingOut(true);
    setLogoutError('');
    try {
      await api.auth.logout();
      setUser(null);
      router.replace('/');
    } catch {
      setLogoutError('تعذر تسجيل الخروج. حاول مرة أخرى.');
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (user === undefined) {
    return <span className="nav-auth-loading" aria-label="جاري تحميل الحساب" aria-busy="true" />;
  }

  if (user === null) {
    return (
      <div className="nav-session" data-auth-state="guest">
        <DiscoveryLinks pathname={pathname} />
        <Link href="/auth/login" className="nav-cta"><PlatformIcon name="lock" size={17}/>دخول</Link>
        <Link href="/auth/register" className="nav-register"><PlatformIcon name="userPlus" size={17}/>إنشاء حساب</Link>
      </div>
    );
  }

  return (
    <div className="nav-session" data-auth-state="authenticated">
      <DiscoveryLinks pathname={pathname} />
      <Link href="/business-profiles">أعمالي</Link>
      <Link href="/organizations">منظماتي</Link>
      <Link href="/users/me" className="nav-cta nav-user" aria-label="الملف الشخصي">{user.profile.displayName}</Link>
      <button className="nav-logout" type="button" onClick={logout} disabled={isLoggingOut} aria-busy={isLoggingOut}><PlatformIcon name="logout" size={17}/>{isLoggingOut ? 'جاري الخروج...' : 'تسجيل الخروج'}</button>
      {logoutError ? <span className="nav-action-error" role="alert">{logoutError}</span> : null}
    </div>
  );
}
