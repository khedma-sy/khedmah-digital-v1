'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicUserProfile } from '../lib/api-client';

function DiscoveryLinks() {
  return (
    <>
      <Link href="/search" className="nav-discovery">البحث</Link>
      <Link href="/service-catalog" className="nav-discovery">الخدمات</Link>
      <Link href="/locations" className="nav-discovery">المواقع</Link>
    </>
  );
}

export function AuthNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<PublicUserProfile | null>();

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
    try {
      await api.auth.logout();
    } finally {
      setUser(null);
      router.replace('/');
    }
  }

  if (user === undefined) {
    return <span className="nav-auth-loading" aria-label="جاري تحميل الحساب" aria-busy="true" />;
  }

  if (user === null) {
    return (
      <div className="nav-session" data-auth-state="guest">
        <DiscoveryLinks />
        <Link href="/auth/login" className="nav-cta">دخول</Link>
        <Link href="/auth/register" className="nav-register">إنشاء حساب</Link>
      </div>
    );
  }

  return (
    <div className="nav-session" data-auth-state="authenticated">
      <DiscoveryLinks />
      <Link href="/business-profiles">أعمالي</Link>
      <Link href="/organizations">منظماتي</Link>
      <Link href="/users/me">الملف الشخصي</Link>
      <Link href="/users/me" className="nav-cta nav-user">{user.profile.displayName}</Link>
      <button className="nav-logout" type="button" onClick={logout}>تسجيل الخروج</button>
    </div>
  );
}
