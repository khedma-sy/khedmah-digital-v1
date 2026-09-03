'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, KhedmahPromotion } from '../../lib/api-client';
import { ActionButton, ActionLink, EmptyState, PageShell, SkeletonGrid, StatusMessage, Surface } from '../components/ui-primitives';
import { PlatformIcon } from '../components/platform-icon';
import { PromotionCard } from './promotion-card';
import { PromotionScanner } from './promotion-scanner';
import styles from './promotions.module.css';

export default function PromotionsPage() {
  const params = useSearchParams();
  const code = params.get('code');
  const [rows, setRows] = useState<KhedmahPromotion[]>([]);
  const [business, setBusiness] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  async function load(query = '') {
    setLoading(true);
    setError('');
    try {
      if (code) {
        const response = await api.promotions.scan(code);
        setRows(response.promotions);
        setBusiness(response.businessName);
      } else {
        const response = await api.promotions.list({ q: query || undefined });
        setRows(response.promotions);
        setBusiness('');
      }
    } catch (cause) {
      setRows([]);
      setError((cause as Error).message || 'تعذر تحميل العروض.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [code]);

  function search(event: FormEvent) {
    event.preventDefault();
    void load(q.trim());
  }

  function clear() {
    setQ('');
    void load('');
  }

  return <PageShell className={styles.page} label="خصومات وعروض خدمة">
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}>وفّر تحت مظلة خدمة</span>
        <h1>{business ? `عروض ${business}` : 'خصومات وعروض خدمة'}</h1>
        <p>اكتشف عروض الأنشطة المعتمدة واحصل على رمز استفادة واضح قبل انتهاء المدة أو نفاد العدد.</p>
        <div className={styles.trustLine} aria-label="مزايا عروض خدمة">
          <span><PlatformIcon name="check" size={15}/>عروض معتمدة</span>
          <span><PlatformIcon name="ticket" size={15}/>رمز استفادة آمن</span>
          <span><PlatformIcon name="qr" size={15}/>QR ثابت للنشاط</span>
        </div>
      </div>
      <nav className={styles.heroActions} aria-label="إدارة العروض والرموز">
        <ActionLink href="/promotions/my"><PlatformIcon name="ticket" size={17}/>رموزي</ActionLink>
        <ActionLink href="/business-profiles" variant="secondary"><PlatformIcon name="tag" size={17}/>أضف عرضًا لنشاطك</ActionLink>
      </nav>
    </header>

    {!code ? <section className={styles.discoveryGrid} aria-label="طرق الوصول إلى العروض">
      <Surface as="form" onSubmit={search} className={styles.searchForm} aria-busy={loading}>
        <div className={styles.panelHeading}>
          <span className={styles.panelIcon}><PlatformIcon name="search" size={22}/></span>
          <div><span className={styles.methodLabel}>الطريقة الأولى</span><h2>ابحث عن عرض</h2><p>اكتب اسم النشاط أو نوع الخدمة التي تحتاجها.</p></div>
        </div>
        <label className={styles.searchLabel} htmlFor="promotions-search">ابحث في العروض</label>
        <div className={styles.searchControl}>
          <PlatformIcon name="search" size={20}/>
          <input id="promotions-search" type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="مثال: مطعم، صيانة أو متجر"/>
          <ActionButton type="submit" disabled={loading}>{loading ? 'جاري البحث' : 'بحث'}</ActionButton>
        </div>
        {q && <button className={styles.clearSearch} type="button" onClick={clear}><PlatformIcon name="refresh" size={16}/>مسح البحث</button>}
      </Surface>
      <PromotionScanner/>
    </section> : <Surface className={styles.businessContext}>
      <span className={styles.panelIcon}><PlatformIcon name="qr" size={22}/></span>
      <div><span className={styles.methodLabel}>تم التحقق من رمز النشاط</span><h2>{business ? `تعرض الآن عروض ${business}` : 'جاري فتح عروض النشاط'}</h2><p>تظهر هنا العروض النشطة والمعتمدة المرتبطة بهذا الرمز فقط.</p></div>
      <ActionLink href="/promotions" variant="secondary">عرض كل العروض</ActionLink>
    </Surface>}

    {error && <StatusMessage tone="danger">{error}</StatusMessage>}

    <section className={styles.results} aria-labelledby="promotions-results-title">
      <div className={styles.resultsHeading}>
        <div><span>عروض منشورة حيًا</span><h2 id="promotions-results-title">العروض المتاحة</h2></div>
        {!loading && rows.length > 0 && <p aria-live="polite">{rows.length.toLocaleString('ar-SY')} عرض متاح الآن</p>}
      </div>
      {loading ? <SkeletonGrid label="جاري تحميل العروض"/> : rows.length ? <section className="ui-card-grid" aria-label="العروض المنشورة">{rows.map((promotion) => <PromotionCard key={promotion.id} promotion={promotion}/>)}</section> : <div className={styles.emptyWrap}><EmptyState icon={<PlatformIcon name="tag" size={32}/>} title={code ? 'لا يوجد عرض نشط لهذا النشاط' : 'لا توجد عروض مطابقة الآن'} description={code ? 'النشاط معتمد، لكن عروضه منتهية أو لم يبدأ نشرها بعد.' : q ? 'غيّر عبارة البحث أو اعرض جميع العروض المتاحة.' : 'ستظهر هنا العروض النشطة والمعتمدة فور نشرها.'} actions={<>{q && <ActionButton type="button" variant="secondary" onClick={clear}><PlatformIcon name="refresh" size={17}/>عرض كل العروض</ActionButton>}<ActionLink href="/map">استكشف القريب منك</ActionLink><ActionLink href="/business-profiles" variant="secondary">أضف عرضًا لنشاطك</ActionLink></>}/></div>}
    </section>
  </PageShell>;
}
