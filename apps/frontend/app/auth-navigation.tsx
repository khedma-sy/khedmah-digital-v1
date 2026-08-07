'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicUserProfile } from '../lib/api-client';

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
    return <Link href="/auth/login" className="nav-cta">دخول</Link>;
  }

  return (
    <div className="nav-authenticated">
      <Link href="/users/me" className="nav-cta">{user.profile.displayName}</Link>
      <button type="button" onClick={logout}>تسجيل الخروج</button>
    </div>
  );
}
