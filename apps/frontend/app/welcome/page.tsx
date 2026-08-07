'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicUserProfile } from '../../lib/api-client';
import { ShareAction } from '../components/share-action';

const PROFESSIONAL_STEPS = ['أكمل بيانات ملفك', 'أضف صورتك', 'أضف تخصصك', 'حدد موقعك'];
const BUSINESS_STEPS = ['أضف شعار عملك', 'أضف خدماتك', 'حدد موقع عملك', 'جهّز صفحة عملك للمشاركة'];

export default function WelcomePage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUserProfile | null>();

  useEffect(() => {
    void api.auth.session().then(({ user: currentUser }) => setUser(currentUser)).catch(() => router.replace('/auth/login'));
  }, [router]);

  if (!user) return <main id="foundation-content" className="welcome-loading" aria-busy="true">جاري تجهيز تجربتك...</main>;

  return (
    <main id="foundation-content" className="welcome-page">
      <header className="welcome-header">
        <p className="eyebrow">KHEDMA DIGITAL</p>
        <h1>مرحباً بك في خدمة ديجتل، {user.profile.displayName}</h1>
        <p>اختر المسار الذي يناسبك وابدأ بناء حضورك الرقمي خطوة بخطوة.</p>
      </header>
      <div className="welcome-grid">
        <section className="welcome-track">
          <span className="audience-label">للمهنيين</span>
          <h2>أظهر خبرتك وخصصك</h2>
          <ol>{PROFESSIONAL_STEPS.map((step) => <li key={step}>{step}</li>)}</ol>
          <div className="welcome-actions">
            <Link href="/professional-profiles/new" className="experience-action">ابدأ ملفك المهني</Link>
            <ShareAction title="ملفي على خدمة ديجتل" text="أنا مع خدمة" />
          </div>
        </section>
        <section className="welcome-track welcome-track-business">
          <span className="audience-label">للأعمال</span>
          <h2>مرحباً بك في شبكة خدمة ديجتل</h2>
          <ol>{BUSINESS_STEPS.map((step) => <li key={step}>{step}</li>)}</ol>
          <div className="welcome-actions">
            <Link href="/business-profiles/new" className="experience-action">أنشئ ملف عملك</Link>
            <ShareAction title="عملي على خدمة ديجتل" text="أنا مع خدمة" />
          </div>
        </section>
      </div>
    </main>
  );
}
