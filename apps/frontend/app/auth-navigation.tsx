'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, PublicUserProfile } from '../lib/api-client';
import { clearFirebaseSocialSession } from '../lib/firebase/auth';
import { PlatformIcon } from './components/platform-icon';

function DiscoveryLinks({ pathname }: { pathname: string }) {
  const links = [
    { href: '/search', label: 'اكتشف', icon: 'compass' as const, active: pathname === '/search' },
    { href: '/categories', label: 'التصنيفات', icon: 'grid' as const, active: pathname === '/categories' },
    { href: '/map', label: 'بالقرب مني', icon: 'pin' as const, active: pathname === '/map' },
    { href: '/restaurants', label: 'اطلب طعام', icon: 'food' as const, active: pathname.startsWith('/restaurants') },
    { href: '/classifieds', label: 'متجر', icon: 'storefront' as const, active: pathname.startsWith('/store') || pathname === '/classifieds' },
    { href: '/mobility', label: 'النقل والتوصيل', icon: 'delivery' as const, active: pathname.startsWith('/mobility') },
    { href: '/promotions', label: 'العروض', icon: 'tag' as const, active: pathname.startsWith('/promotions') || pathname === '/live' }
  ];
  return (
    <>
      {links.map((link) => <Link key={link.href} href={link.href} className="nav-discovery" aria-current={link.active ? 'page' : undefined}><PlatformIcon name={link.icon} size={16}/><span>{link.label}</span></Link>)}
    </>
  );
}

export function AuthNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<PublicUserProfile | null>();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const localLogoutInProgress = useRef(false);

  useEffect(() => {
    let active = true;

    if (localLogoutInProgress.current) {
      setUser(null);
      return () => {
        active = false;
      };
    }

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
    localLogoutInProgress.current = true;
    setUser(null);

    const [platformLogout] = await Promise.allSettled([
      api.auth.logout(),
      clearFirebaseSocialSession(),
    ]);

    if (platformLogout.status === 'rejected') {
      setLogoutError('تم تسجيل خروجك من هذا الجهاز، لكن تعذر إنهاء الجلسة على الخادم. أغلق المتصفح إذا كنت تستخدم جهازًا مشتركًا.');
      router.replace('/auth/login');
    } else {
      router.replace('/');
      router.refresh();
    }
    setIsLoggingOut(false);
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
    <>
      <div className="nav-session" data-auth-state="authenticated">
        <DiscoveryLinks pathname={pathname} />
        <Link href="/business-profiles">أعمالي</Link>
        <Link href="/users/me" className="nav-cta nav-user" aria-label="الملف الشخصي">{user.profile.displayName}</Link>
        <button className="nav-logout" type="button" onClick={logout} disabled={isLoggingOut} aria-busy={isLoggingOut}><PlatformIcon name="logout" size={17}/>{isLoggingOut ? 'جاري الخروج...' : 'تسجيل الخروج'}</button>
      </div>
      {logoutError ? <p className="nav-action-error" role="alert">{logoutError}</p> : null}
    </>
  );
}
