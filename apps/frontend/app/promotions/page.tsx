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
  const [discoveryMode, setDiscoveryMode] = useState<'search' | 'scan'>('search');
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

  function browseShortcut(query: string) {
    setQ(query);
    setDiscoveryMode('search');
    void load(query);
  }

  return <PageShell className={styles.page} label="خصومات وعروض خدمة">
    <section className={styles.dealsHub} aria-label="عروض خدمة">
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <span className={styles.dealsBrand}><PlatformIcon name="tag" size={17}/>عروض خدمة</span>
        <h1>{business ? `عروض ${business}` : 'وفّر على خدمتك التالية'}</h1>
        <p>ابحث عن عرض قريب، قارن السعر، واحجز رمزك مباشرة.</p>
        <div className={styles.trustLine} aria-label="مزايا عروض خدمة">
          <span><PlatformIcon name="check" size={16}/>سعر قبل الخصم وبعده</span>
          <span><PlatformIcon name="ticket" size={16}/>مدة وعدد محددان</span>
          <span><PlatformIcon name="qr" size={16}/>رمز استخدام آمن</span>
        </div>
      </div>
      <ActionLink href="/promotions/my" variant="secondary" className={styles.walletLink}><PlatformIcon name="ticket" size={18}/>عروضي المحفوظة</ActionLink>
    </header>

    {!code ? <Surface className={styles.offerExplorer}>
      <div className={styles.explorerHeader}>
        <div className={styles.panelHeading}>
          <span className={styles.panelIcon}><PlatformIcon name={discoveryMode === 'search' ? 'search' : 'qr'} size={22}/></span>
          <div><span className={styles.methodLabel}>ابدأ من هنا</span><h2>{discoveryMode === 'search' ? 'ابحث في العروض' : 'افتح عروض النشاط'}</h2><p>{discoveryMode === 'search' ? 'اكتب اسم النشاط أو نوع الخدمة التي تحتاجها.' : 'امسح رمز النشاط أو أدخل الرمز المكتوب تحته.'}</p></div>
        </div>
        <div className={styles.modeSwitch} role="group" aria-label="طريقة الوصول إلى العرض">
          <button type="button" aria-pressed={discoveryMode === 'search'} onClick={() => setDiscoveryMode('search')}><PlatformIcon name="search" size={17}/>بحث</button>
          <button type="button" aria-pressed={discoveryMode === 'scan'} onClick={() => setDiscoveryMode('scan')}><PlatformIcon name="qr" size={17}/>مسح الرمز</button>
        </div>
      </div>
      {discoveryMode === 'search' ? <form onSubmit={search} className={styles.searchForm} aria-busy={loading}>
        <label className={styles.searchLabel} htmlFor="promotions-search">اسم النشاط أو الخدمة</label>
        <div className={styles.searchControl}>
          <PlatformIcon name="search" size={20}/>
          <input id="promotions-search" type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="مثال: مطعم، صيانة أو متجر"/>
          <ActionButton type="submit" disabled={loading}>{loading ? 'جارٍ البحث…' : 'ابحث'}</ActionButton>
        </div>
        {q && <button className={styles.clearSearch} type="button" onClick={clear}><PlatformIcon name="refresh" size={16}/>عرض جميع العروض</button>}
      </form> : <PromotionScanner/>}
      <nav className={styles.quickDeals} aria-label="فئات العروض الشائعة">
        {['مطاعم', 'جمال', 'صيانة', 'سيارات', 'تسوق'].map((label) => <button type="button" key={label} aria-pressed={q === label} onClick={() => browseShortcut(label)}>{label}</button>)}
      </nav>
      <div className={styles.smartReviewNote}>
        <PlatformIcon name="sparkles" size={18}/>
        <p><strong>عروض معتمدة.</strong> يراجع نظام خدمة الأسعار والمدة قبل النشر.</p>
      </div>
    </Surface> : <Surface className={styles.businessContext}>
      <span className={styles.panelIcon}><PlatformIcon name="qr" size={22}/></span>
      <div><span className={styles.methodLabel}>رمز نشاط موثّق</span><h2>{business ? `عروض ${business}` : 'جاري فتح عروض النشاط'}</h2><p>تعرض هذه الصفحة العروض النشطة والمعتمدة لهذا النشاط فقط.</p></div>
      <ActionLink href="/promotions" variant="secondary">عرض كل العروض</ActionLink>
    </Surface>}
    </section>

    {error && <StatusMessage tone="danger">{error}</StatusMessage>}

    <section className={styles.results} aria-labelledby="promotions-results-title">
      <div className={styles.resultsHeading}>
        <div><span>صالحة للاستخدام الآن</span><h2 id="promotions-results-title">العروض المتاحة</h2></div>
        {!loading && rows.length > 0 && <p aria-live="polite">{rows.length.toLocaleString('ar-SY-u-nu-latn')} {rows.length === 1 ? 'عرض' : 'عروض'} متاحة</p>}
      </div>
      {loading ? <SkeletonGrid label="جاري تحميل العروض"/> : rows.length ? <section className="ui-card-grid" aria-label="العروض المنشورة">{rows.map((promotion) => <PromotionCard key={promotion.id} promotion={promotion}/>)}</section> : <div className={styles.emptyWrap}><EmptyState icon={<PlatformIcon name="tag" size={32}/>} title={code ? 'لا يوجد عرض نشط لهذا النشاط' : 'لا توجد عروض مطابقة الآن'} description={code ? 'النشاط معتمد، لكن عروضه منتهية أو لم يبدأ نشرها بعد.' : q ? 'جرّب اسمًا أقصر أو اعرض جميع العروض المتاحة.' : 'ستظهر العروض المعتمدة هنا فور نشرها.'} actions={q ? <ActionButton type="button" variant="secondary" onClick={clear}><PlatformIcon name="refresh" size={17}/>عرض جميع العروض</ActionButton> : code ? <ActionLink href="/promotions">عرض جميع العروض</ActionLink> : <ActionLink href="/map">استكشف الأنشطة القريبة</ActionLink>}/></div>}
    </section>

    <aside className={styles.ownerEntry} aria-label="إدارة عروض النشاط">
      <div><PlatformIcon name="storefront" size={20}/><p><strong>لديك نشاط على خدمة؟</strong><span>أنشئ عرضًا واضحًا وتابع اعتماده واستخدامه من لوحة نشاطك.</span></p></div>
      <ActionLink href="/business-profiles" variant="quiet">إدارة عروض نشاطي</ActionLink>
    </aside>
  </PageShell>;
}
