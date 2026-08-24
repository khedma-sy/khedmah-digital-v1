'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicUserProfile } from '../../lib/api-client';
import { BrandMark } from '../components/brand-mark';

export default function WelcomePage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUserProfile | null>();

  useEffect(() => {
    if (sessionStorage.getItem('khedmah.onboarding.complete') === 'true') {
      router.replace('/');
      return;
    }
    void api.auth.session()
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch(() => router.replace('/auth/login'));
  }, [router]);

  function completeOnboarding() {
    sessionStorage.setItem('khedmah.onboarding.complete', 'true');
    router.push('/');
  }

  if (!user) {
    return <main id="foundation-content" className="welcome-loading" aria-busy="true">جاري تجهيز تجربتك...</main>;
  }

  return (
    <main id="foundation-content" className="khedma-welcome">
      <section className="khedma-welcome-card">
        <BrandMark />
        <p>مرحباً {user.profile.displayName}</p>
        <h1>أهلاً بك تحت مظلة خدمة</h1>
        <p>يمكنك الآن اكتشاف الأعمال والمهنيين والخدمات، وإدارة حسابك وملفاتك من تجربة واحدة موحدة.</p>
        <button type="button" className="map-continue" onClick={completeOnboarding}>متابعة إلى الرئيسية</button>
      </section>
    </main>
  );
}
