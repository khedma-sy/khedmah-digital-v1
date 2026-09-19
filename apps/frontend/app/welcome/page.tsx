'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicUserProfile } from '../../lib/api-client';
import { BrandMark } from '../components/brand-mark';
import { PlatformIcon } from '../components/platform-icon';
import { ActionButton, SkeletonGrid, StatusMessage, Surface } from '../components/ui-primitives';
import styles from './welcome.module.css';

const benefits = [
  { icon: 'search' as const, title: 'اكتشف بسهولة', text: 'ابحث حسب الخدمة والتصنيف والمنطقة.' },
  { icon: 'check' as const, title: 'معلومات أوضح', text: 'اطّلع على الملفات المنشورة ووسائل التواصل.' },
  { icon: 'briefcase' as const, title: 'أدر نشاطك', text: 'أنشئ حضورك وأرسل ملفك للمراجعة.' }
];

export default function WelcomePage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUserProfile | null>();
  const [error, setError] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('khedmah.onboarding.complete') === 'true') {
        router.replace('/');
        return;
      }
    } catch { /* Storage is optional; session validation remains authoritative. */ }
    let active = true;
    setUser(undefined);
    setError('');
    setSessionExpired(false);
    void api.auth.session()
      .then(({ user: currentUser }) => { if (active) {
        setUser(currentUser);
        if (!currentUser) { setSessionExpired(true); setError('انتهت الجلسة. سجّل الدخول للمتابعة.'); }
      } })
      .catch((cause: unknown) => {
        if (!active) return;
        const status = cause && typeof cause === 'object' && 'statusCode' in cause ? cause.statusCode : undefined;
        setUser(null);
        setSessionExpired(status === 401);
        setError(status === 401 ? 'انتهت الجلسة. سجّل الدخول للمتابعة.'
          : status === 403 ? 'تعذر الوصول إلى بيانات الحساب. أعد المحاولة أو ارجع للرئيسية.'
          : 'تعذر تحميل بيانات الجلسة. تحقق من الاتصال ثم أعد المحاولة.');
      });
    return () => { active = false; };
  }, [router, retryCount]);

  function completeOnboarding() {
    try { sessionStorage.setItem('khedmah.onboarding.complete', 'true'); } catch { /* Continue if browser storage is unavailable. */ }
    router.push('/');
  }

  if (user === undefined) return <main id="foundation-content" className={styles.page} aria-label="جاري تجهيز تجربة خدمة"><div className={styles.container}><SkeletonGrid count={3} label="جاري تجهيز تجربتك" /></div></main>;

  if (!user) return <main id="foundation-content" className={styles.page}><div className={styles.container}><StatusMessage tone="warning">{error}</StatusMessage>{sessionExpired
    ? <ActionButton type="button" onClick={() => router.push('/auth/login')}>تسجيل الدخول</ActionButton>
    : <><ActionButton type="button" onClick={() => setRetryCount((value) => value + 1)}>إعادة المحاولة</ActionButton><ActionButton type="button" variant="secondary" onClick={() => router.push('/')}>العودة للرئيسية</ActionButton></>}</div></main>;

  return <main id="foundation-content" className={styles.page} aria-label="مرحباً بك في خدمة">
    <div className={styles.container}>
      <section className={styles.hero}>
        <div className={styles.brand}><BrandMark /><p>مرحباً {user.profile.displayName}</p></div>
        <h1>كل ما تحتاجه، <em>أقرب إليك</em></h1>
        <p className={styles.lead}>اكتشف الأنشطة والخدمات المحلية المنشورة، قارن المعلومات، ثم تواصل مباشرة — تحت مظلة واحدة.</p>
        <ActionButton type="button" onClick={completeOnboarding}>ابدأ الاكتشاف <PlatformIcon name="arrow" size={18} /></ActionButton>
      </section>
      <section className={styles.benefits} aria-label="مزايا خدمة">
        {benefits.map((benefit) => <Surface as="article" className={styles.benefit} key={benefit.title}>
          <span><PlatformIcon name={benefit.icon} size={22} /></span><h2>{benefit.title}</h2><p>{benefit.text}</p>
        </Surface>)}
      </section>
      <p className={styles.privacy}><PlatformIcon name="lock" size={16} /> لا ننشر بياناتك أو موقعك دون موافقتك.</p>
    </div>
  </main>;
}
