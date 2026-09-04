'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { api, PublicBusinessProfile } from '../../lib/api-client';
import { PlatformIcon } from '../components/platform-icon';
import { ActionButton, ActionLink, EmptyState, StatusMessage, Surface } from '../components/ui-primitives';
import styles from '../discovery.module.css';

type Bounds = { south: number; west: number; north: number; east: number };
type MapHandle = {
  getBounds(): { toJSON(): Bounds } | undefined;
  addListener(name: string, listener: () => void): void;
  panTo(point: Coordinates): void;
  fitBounds(bounds: Bounds): void;
};
type Coordinates = { lat: number; lng: number };
type Overlay = { setMap(map: MapHandle | null): void };
type Marker = Overlay & { addListener(name: string, listener: () => void): void };
type MapsApi = {
  Map: new (node: HTMLElement, options: object) => MapHandle;
  Marker: new (options: object) => Marker;
  Circle: new (options: object) => Overlay;
  InfoWindow: new (options: object) => { open(options: object): void; close(): void };
};
declare global {
  interface Window {
    google?: { maps: MapsApi };
    gm_authFailure?: () => void;
    initKhedmahMap?: () => void;
  }
}

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
const DEFAULT_LOCATION = { latitude: 33.5138, longitude: 36.2765 };
const MAP_SCRIPT_ID = 'khedmah-google-maps';

function MapDiscovery() {
  const searchParams = useSearchParams();
  const mapNode = useRef<HTMLDivElement>(null);
  const map = useRef<MapHandle | null>(null);
  const overlays = useRef<Overlay[]>([]);
  const infoWindow = useRef<{ close(): void } | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialQuery = searchParams.get('q') ?? '';
  const initialBounds = (() => {
    const rawValues = ['south', 'west', 'north', 'east'].map((key) => searchParams.get(key));
    if (rawValues.some((value) => value === null)) return undefined;
    const values = rawValues.map(Number);
    return values.every(Number.isFinite) && values[0] < values[2] && values[1] < values[3]
      ? { south: values[0], west: values[1], north: values[2], east: values[3] } : undefined;
  })();
  const [query, setQuery] = useState(initialQuery);
  const [providers, setProviders] = useState<PublicBusinessProfile[]>([]);
  const [isSearching, setIsSearching] = useState(true);
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [locationSource, setLocationSource] = useState<'default' | 'device'>('default');
  const [activeView, setActiveView] = useState<'map' | 'list'>('map');
  const [status, setStatus] = useState('جاري تحميل مقدمي الخدمات…');
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>(MAPS_KEY ? 'loading' : 'error');
  const [mapError, setMapError] = useState(MAPS_KEY ? '' : 'إعداد خريطة Google غير متوفر حالياً. يمكنك متابعة البحث من عرض النتائج.');
  const [mapCanRetry, setMapCanRetry] = useState(Boolean(MAPS_KEY));
  const [mapLoadAttempt, setMapLoadAttempt] = useState(0);

  const search = useCallback(async (boundaries?: Bounds, nextLocation = location, nextQuery = query) => {
    setIsSearching(true);
    setStatus('جاري تحديث النتائج…');
    try {
      const result = await api.search.query({ q: nextQuery || undefined, map: true, boundaries, latitude: nextLocation.latitude, longitude: nextLocation.longitude, type: 'business' });
      setProviders(result.businesses);
      setStatus(result.businesses.length ? `${result.businesses.length} مقدم خدمة ضمن المنطقة الظاهرة` : 'لا توجد خدمات مطابقة ضمن المنطقة الظاهرة');
      const url = new URL(window.location.href);
      url.searchParams.set('map', 'true');
      nextQuery ? url.searchParams.set('q', nextQuery) : url.searchParams.delete('q');
      if (boundaries) Object.entries(boundaries).forEach(([key, value]) => url.searchParams.set(key, String(value)));
      window.history.replaceState(null, '', url);
    } catch (error) {
      setProviders([]);
      setStatus(error instanceof Error ? error.message : 'تعذر تحميل مقدمي الخدمات');
    } finally {
      setIsSearching(false);
    }
  }, [location, query]);

  const renderMarkers = useCallback(() => {
    if (!map.current || !window.google) return;
    overlays.current.forEach((overlay) => overlay.setMap(null));
    infoWindow.current?.close();
    overlays.current = providers.flatMap((provider) => {
      if (provider.lat === undefined || provider.lng === undefined) return [];
      const position = { lat: provider.lat, lng: provider.lng };
      const circle = new window.google!.maps.Circle({ map: map.current, center: position, radius: (provider.serviceRadius ?? 25) * 1000, fillColor: '#7fc63b', fillOpacity: 0.08, strokeColor: '#7fc63b', strokeOpacity: 0.4 });
      const marker = new window.google!.maps.Marker({ map: map.current, position, title: provider.name });
      marker.addListener('click', () => {
        infoWindow.current?.close();
        const content = document.createElement('a');
        content.href = `/business-profiles/${encodeURIComponent(provider.id)}?source=map`;
        content.textContent = `${provider.name} — عرض الملف وطلب الخدمة`;
        content.dir = 'rtl';
        const popup = new window.google!.maps.InfoWindow({ content });
        popup.open({ map: map.current, anchor: marker });
        infoWindow.current = popup;
      });
      return [circle, marker];
    });
  }, [providers]);

  const initializeMap = useCallback(() => {
    if (!mapNode.current || !window.google || map.current) return;
    map.current = new window.google.maps.Map(mapNode.current, { center: { lat: location.latitude, lng: location.longitude }, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
    setMapStatus('ready');
    setMapError('');
    if (initialBounds) map.current.fitBounds(initialBounds);
    map.current.addListener('idle', () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        const visibleBounds = map.current?.getBounds()?.toJSON();
        if (visibleBounds) void search(visibleBounds);
      }, 300);
    });
    renderMarkers();
  }, [location, renderMarkers, search]);

  const initializeMapRef = useRef(initializeMap);
  useEffect(() => { initializeMapRef.current = initializeMap; }, [initializeMap]);

  useEffect(renderMarkers, [renderMarkers]);
  useEffect(() => { void search(initialBounds, DEFAULT_LOCATION, initialQuery); }, []);
  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current); }, []);
  useEffect(() => {
    if (!MAPS_KEY) {
      setActiveView('list');
      return;
    }
    const isolatedPreview = /^khedmah-pr-\d+-frontend-/.test(window.location.hostname);
    if (isolatedPreview) {
      setMapCanRetry(false);
      setMapStatus('error');
      setMapError('الخريطة ستتوفر عند إطلاق النطاق الرسمي. استخدم البحث والنتائج الآن.');
      setStatus('اعرض مقدمي الخدمات من قائمة النتائج إلى حين فتح النطاق الرسمي.');
      setActiveView('list');
      return;
    }

    let cancelled = false;
    let insertedScript: HTMLScriptElement | null = null;
    const previousAuthFailure = window.gm_authFailure;
    const previousInitializer = window.initKhedmahMap;
    const failMap = (message: string, canRetry = true) => {
      if (cancelled) return;
      setMapCanRetry(canRetry);
      setMapStatus('error');
      setMapError(message);
      setStatus(message);
      setActiveView('list');
    };

    window.initKhedmahMap = () => {
      if (cancelled) return;
      initializeMapRef.current();
    };
    window.gm_authFailure = () => failMap('رفضت Google Maps مفتاح هذا النطاق. يمكنك متابعة البحث من النتائج إلى حين تصحيح الإعداد.', false);

    if (window.google?.maps) {
      initializeMapRef.current();
    } else {
      document.getElementById(MAP_SCRIPT_ID)?.remove();
      insertedScript = document.createElement('script');
      insertedScript.id = MAP_SCRIPT_ID;
      insertedScript.async = true;
      insertedScript.defer = true;
      insertedScript.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&language=ar&region=SY&libraries=places&loading=async&callback=initKhedmahMap`;
      insertedScript.onerror = () => failMap('تعذر الاتصال بخدمة خرائط Google. تحقق من الاتصال أو تابع من عرض النتائج.');
      document.head.appendChild(insertedScript);
    }

    const timeout = window.setTimeout(() => {
      if (!map.current) failMap('استغرق تحميل الخريطة وقتاً أطول من المتوقع. يمكنك إعادة المحاولة أو متابعة النتائج.');
    }, 20000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      window.gm_authFailure = previousAuthFailure;
      window.initKhedmahMap = previousInitializer;
      if (insertedScript && !window.google?.maps) insertedScript.remove();
    };
  }, [mapLoadAttempt]);

  function retryMap() {
    if (!mapCanRetry) return;
    map.current = null;
    setMapStatus('loading');
    setMapError('');
    setStatus('جاري إعادة تشغيل الخريطة…');
    setActiveView('map');
    setMapLoadAttempt((attempt) => attempt + 1);
  }

  function locateUser() {
    setStatus('جاري تحديد موقعك…');
    if (!navigator.geolocation) {
      setStatus('تحديد الموقع غير مدعوم على هذا الجهاز. اكتب اسم الخدمة واستخدم النتائج.');
      setActiveView('list');
      return;
    }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const next = { latitude: coords.latitude, longitude: coords.longitude };
      setLocation(next);
      setLocationSource('device');
      map.current?.panTo({ lat: next.latitude, lng: next.longitude });
      void search(map.current?.getBounds()?.toJSON(), next);
    }, () => setStatus('تعذر الوصول إلى موقعك. حرّك الخريطة يدوياً.'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  return <main className={`${styles.mapPage} ${activeView === 'list' ? styles.listView : ''}`} data-map-status={mapStatus} dir="rtl">
    <aside className={styles.mapPanel}>
      <header><span className={styles.mapKicker}><PlatformIcon name="pin" size={15}/> بالقرب مني</span><h1>خدمات حول موقعك</h1><p className={styles.meta}>استخدم موقعك أو ابحث عن خدمة، ثم افتح ملف مقدم الخدمة مباشرة.</p></header>
      <ActionButton className={styles.locateAction} type="button" onClick={locateUser}><PlatformIcon name="pin" size={17}/> استخدم موقعي الحالي</ActionButton>
      <p className={styles.locationContext} aria-live="polite"><PlatformIcon name={locationSource === 'device' ? 'check' : 'info'} size={15}/>{locationSource === 'device' ? 'يتم الآن البحث ضمن المنطقة المحيطة بموقعك.' : 'يبدأ العرض من دمشق؛ استخدم موقعك لنتائج أقرب إليك.'}</p>
      <form onSubmit={(event) => { event.preventDefault(); void search(map.current?.getBounds()?.toJSON()); }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="الخدمة المطلوبة" placeholder="مثال: تصليح مكيف" />
        <ActionButton type="submit" variant="secondary"><PlatformIcon name="search" size={17}/> بحث</ActionButton>
      </form>
      <nav className={styles.viewSwitch} aria-label="طريقة عرض النتائج">
        <ActionButton type="button" disabled={mapStatus === 'error' && !mapCanRetry} variant={activeView === 'map' ? 'primary' : 'secondary'} aria-pressed={activeView === 'map'} onClick={() => setActiveView('map')}><PlatformIcon name="pin" size={17}/> الخريطة</ActionButton>
        <ActionButton type="button" variant={activeView === 'list' ? 'primary' : 'secondary'} aria-pressed={activeView === 'list'} onClick={() => setActiveView('list')}><PlatformIcon name="grid" size={17}/> النتائج</ActionButton>
      </nav>
      <StatusMessage tone={mapStatus === 'error' ? 'warning' : 'info'}>{mapStatus === 'error' ? mapError : status}</StatusMessage>
      {mapStatus === 'error' && mapCanRetry && <div className={styles.mapRecovery}><ActionButton type="button" variant="secondary" onClick={retryMap}><PlatformIcon name="refresh" size={17}/> إعادة تشغيل الخريطة</ActionButton><span>البحث والنتائج يعملان دون الخريطة.</span></div>}
      <section className={styles.providerList} aria-label="مقدمو الخدمات">
        {providers.map((provider) => <Surface as="article" className={styles.provider} key={provider.id}>
          <div><h2>{provider.name} {provider.trustStatus === 'approved' && <span aria-label="موثّق">✓</span>}</h2><p>{provider.availability === 'available' ? 'متاح الآن' : provider.availability === 'busy' ? 'مشغول' : 'حسب الموعد'} {provider.rating !== undefined ? `· ★ ${provider.rating.toFixed(1)}` : ''} {provider.distanceKm !== undefined ? `· ${provider.distanceKm.toFixed(1)} كم` : ''}</p></div>
          <ActionLink href={`/business-profiles/${encodeURIComponent(provider.id)}?source=map`}>عرض النشاط</ActionLink>
        </Surface>)}
        {!isSearching && providers.length === 0 && <EmptyState icon={<PlatformIcon name="search" size={30}/>} title={query ? `لا توجد نتائج مطابقة لـ «${query}»` : 'لا توجد خدمات منشورة قرب هذا الموقع بعد'} description="جرّب اسم خدمة آخر أو تصفح التصنيفات للوصول إلى مقدم الخدمة المناسب." actions={<><ActionLink href="/categories">استكشف التصنيفات</ActionLink>{query && <ActionButton type="button" variant="secondary" onClick={() => { setQuery(''); void search(undefined, location, ''); }}>مسح البحث</ActionButton>}</>} />}
      </section>
    </aside>
    <section className={styles.mapStage} aria-label="منطقة الخريطة">
      <div className={styles.mapCanvas} ref={mapNode} aria-label="خريطة مقدمي الخدمات" />
      {mapStatus !== 'ready' && <div className={styles.mapFallback} role={mapStatus === 'error' ? 'alert' : 'status'}>
        <PlatformIcon name="pin" size={34}/>
        <h2>{mapStatus === 'error' ? 'تعذر تشغيل الخريطة' : 'جاري تجهيز الخريطة'}</h2>
        <p>{mapStatus === 'error' ? mapError : 'لحظات ونحدد الخدمات الأقرب إليك.'}</p>
        {mapStatus === 'error' && <div className={styles.mapFallbackActions}>{mapCanRetry && <ActionButton type="button" onClick={retryMap}>إعادة المحاولة</ActionButton>}<ActionButton type="button" variant="secondary" onClick={() => setActiveView('list')}>عرض النتائج</ActionButton></div>}
      </div>}
    </section>
  </main>;
}

export default function MarketplaceMapPage() {
  return <Suspense fallback={<main className={styles.mapPage} dir="rtl">جاري فتح الخريطة…</main>}><MapDiscovery /></Suspense>;
}
