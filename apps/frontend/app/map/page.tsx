'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { api, PublicBusinessProfile } from '../../lib/api-client';
import { mapContextKey, mapHref, providerBounds, readMapContext, validMapBounds, type MapBounds } from '../../lib/map-context';
import { searchHref } from '../../lib/search-context';
import { canonicalCityCode, cityLabel, useSyrianCities } from '../../lib/use-syrian-cities';
import { useCategories } from '../../lib/use-categories';
import { PlatformIcon } from '../components/platform-icon';
import { ActionButton, ActionLink, StatusMessage, Surface } from '../components/ui-primitives';
import styles from '../discovery.module.css';

type Bounds = MapBounds;
type MapListener = { remove(): void };
type MapHandle = {
  getBounds(): { toJSON(): Bounds } | undefined;
  addListener(name: string, listener: () => void): MapListener;
  panTo(point: Coordinates): void;
  getCenter(): { lat(): number; lng(): number } | undefined;
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
// Initial camera only: never sent as the user's position or used to calculate distance.
const DEFAULT_CENTER = { lat: 33.5138, lng: 36.2765 };
const NO_PROVIDERS: PublicBusinessProfile[] = [];
const MAP_SCRIPT_ID = 'khedmah-google-maps';

function MapDiscovery() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const context = readMapContext(searchParams);
  const { q: appliedQuery, cityCode, categoryCode } = context;
  const contextKey = mapContextKey(context);
  const { cities, isLoading: citiesLoading, error: citiesError, retry: retryCities } = useSyrianCities();
  const { categories, isLoading: categoriesLoading, error: categoriesError, retry: retryCategories } = useCategories();
  const mapNode = useRef<HTMLDivElement>(null);
  const map = useRef<MapHandle | null>(null);
  const listeners = useRef<MapListener[]>([]);
  const overlays = useRef<Overlay[]>([]);
  const infoWindow = useRef<{ close(): void } | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticView = useRef(true);
  const viewportIntent = useRef(false);
  const sequence = useRef(0);
  const geoSequence = useRef(0);
  const [query, setQuery] = useState(appliedQuery);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | undefined>();
  const pendingLocation = useRef<typeof location>(undefined);
  const [locating, setLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');
  const [activeView, setActiveView] = useState<'map' | 'list'>('map');
  const [retryCount, setRetryCount] = useState(0);
  const [requestLoading, setRequestLoading] = useState(false);
  const [viewportError, setViewportError] = useState('');
  const [result, setResult] = useState<{ key: string; providers: PublicBusinessProfile[]; total: number; error: string }>({ key: '', providers: [], total: 0, error: '' });
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>(MAPS_KEY ? 'loading' : 'error');
  const [mapError, setMapError] = useState(MAPS_KEY ? '' : 'إعداد خريطة Google غير متوفر حالياً. يمكنك متابعة البحث من عرض النتائج.');
  const [mapLoadAttempt, setMapLoadAttempt] = useState(0);
  const waitingForMetadata = (!!cityCode && citiesLoading) || (!!categoryCode && categoriesLoading);
  const validationError = context.invalidBounds ? 'حدود الخريطة في الرابط غير صالحة. امسح تحديد المنطقة لإعادة البحث.'
    : cityCode && citiesError ? 'تعذر التحقق من المدينة المحددة. أعد تحميل المدن دون تغيير اختيارك.'
    : cityCode && !citiesLoading && !canonicalCityCode(cityCode, cities) ? 'المدينة المحددة غير متاحة. عدّل عوامل البحث.'
    : categoryCode && categoriesError ? 'تعذر التحقق من التصنيف المحدد. أعد تحميل التصنيفات دون تغيير اختيارك.'
    : categoryCode && !categoriesLoading && !categories.some(({ code }) => code === categoryCode) ? 'التصنيف المحدد غير متاح. عدّل عوامل البحث.' : '';
  const requestKey = JSON.stringify([contextKey, location?.latitude, location?.longitude]);
  const error = validationError || (result.key === requestKey ? result.error : '');
  const isLoading = !validationError && !viewportError && (waitingForMetadata || requestLoading || locating || result.key !== requestKey);
  const providers = !isLoading && !error && !viewportError ? result.providers : NO_PROVIDERS;
  const latest = useRef({ context, contextKey });
  latest.current = { context, contextKey };

  useEffect(() => { setQuery(appliedQuery); }, [appliedQuery, cityCode, categoryCode]);

  useEffect(() => {
    setViewportError('');
    geoSequence.current += 1;
    pendingLocation.current = undefined;
    setLocating(false);
    setLocationStatus('');
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    viewportIntent.current = false;
  }, [contextKey]);

  const normalizationHref = searchParams.get('category') !== null && !context.invalidBounds ? mapHref(context) : '';
  useEffect(() => {
    if (normalizationHref) router.replace(normalizationHref, { scroll: false });
  }, [normalizationHref, router]);

  // Navigation owns requests. Map events and forms change the URL, never fetch directly.
  useEffect(() => {
    const requestId = ++sequence.current;
    if (waitingForMetadata || validationError || locating) {
      setRequestLoading(false);
      return () => { sequence.current += 1; };
    }
    setRequestLoading(true);
    async function search() {
      try {
        const data = await api.search.query({ q: appliedQuery || undefined, cityCode: cityCode || undefined,
          categoryCode: categoryCode || undefined, map: true, boundaries: context.boundaries,
          latitude: location?.latitude, longitude: location?.longitude, type: 'business' });
        if (requestId === sequence.current) setResult({ key: requestKey, providers: data.businesses, total: data.total, error: '' });
      } catch (cause) {
        if (requestId === sequence.current) setResult({ key: requestKey, providers: [], total: 0,
          error: cause instanceof Error ? cause.message : 'تعذر تحميل مقدمي الخدمات.' });
      } finally {
        if (requestId === sequence.current) setRequestLoading(false);
      }
    }
    void search();
    return () => { sequence.current += 1; };
  }, [requestKey, waitingForMetadata, validationError, locating, retryCount]);

  function navigate(next: typeof context, mode: 'push' | 'replace' = 'push') {
    const href = mapHref(next);
    if (mapContextKey(readMapContext(new URLSearchParams(href.split('?')[1]))) === contextKey) {
      setRetryCount((count) => count + 1);
      return;
    }
    sequence.current += 1;
    setRequestLoading(true);
    router[mode](href, { scroll: false });
  }
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const renderMarkers = useCallback(() => {
    if (!map.current || !window.google) return;
    overlays.current.forEach((overlay) => overlay.setMap(null));
    infoWindow.current?.close();
    overlays.current = providers.flatMap((provider) => {
      if (!providerBounds([provider])) return [];
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

  const clearMap = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    listeners.current.forEach((listener) => listener.remove());
    listeners.current = [];
    overlays.current.forEach((overlay) => overlay.setMap(null));
    overlays.current = [];
    infoWindow.current?.close();
    map.current = null;
  }, []);

  const initializeMap = useCallback(() => {
    if (!mapNode.current || !window.google || map.current) return;
    programmaticView.current = true;
    viewportIntent.current = false;
    const handle = new window.google.maps.Map(mapNode.current, { center: DEFAULT_CENTER, zoom: 7,
      mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
    map.current = handle;
    setMapStatus('ready');
    setMapError('');
    const markViewportIntent = () => {
      if (programmaticView.current) return;
      viewportIntent.current = true;
      // Invalidate an in-flight area's response as soon as the user moves away.
      sequence.current += 1;
      setRequestLoading(true);
    };
    listeners.current = [
      handle.addListener('dragstart', () => { programmaticView.current = false; markViewportIntent(); }),
      handle.addListener('zoom_changed', markViewportIntent),
      handle.addListener('bounds_changed', markViewportIntent),
      handle.addListener('idle', () => {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = null;
        const shouldSearch = viewportIntent.current || !!pendingLocation.current;
        programmaticView.current = false;
        viewportIntent.current = false;
        if (!shouldSearch) return;
        const owner = latest.current.contextKey;
        idleTimer.current = setTimeout(() => {
          idleTimer.current = null;
          if (map.current !== handle || owner !== latest.current.contextKey) return;
          const boundaries = handle.getBounds()?.toJSON();
          if (!boundaries || !validMapBounds(boundaries)) {
            setViewportError('هذه المنطقة تتجاوز حدود البحث المدعومة. قرّب الخريطة أو امسح تحديد المنطقة.');
            setRequestLoading(false);
            pendingLocation.current = undefined;
            setLocating(false);
            return;
          }
          if (pendingLocation.current) setLocation(pendingLocation.current);
          pendingLocation.current = undefined;
          setLocating(false);
          setLocationStatus('');
          setViewportError('');
          navigateRef.current({ ...latest.current.context, boundaries, invalidBounds: false }, 'replace');
        }, 300);
      })
    ];
  }, []);

  const initializeMapRef = useRef(initializeMap);
  useEffect(() => { initializeMapRef.current = initializeMap; }, [initializeMap]);
  useEffect(renderMarkers, [renderMarkers, mapStatus]);

  // Restore an explicit viewport; otherwise fit actual matching providers. An initial
  // camera/automatic fit must never constrain a city search to the default center.
  useEffect(() => {
    if (!map.current || mapStatus !== 'ready' || locating || viewportError || viewportIntent.current || idleTimer.current) return;
    const boundaries = context.boundaries ?? (!isLoading && !error ? providerBounds(providers) : undefined);
    if (!boundaries) return;
    const current = map.current.getBounds()?.toJSON();
    if (current && (['south', 'west', 'north', 'east'] as const).every((key) => current[key] === boundaries[key])) return;
    programmaticView.current = true;
    viewportIntent.current = false;
    map.current.fitBounds(boundaries);
  }, [contextKey, result, isLoading, error, mapStatus, locating, viewportError]);

  useEffect(() => () => { geoSequence.current += 1; clearMap(); }, [clearMap]);
  useEffect(() => {
    if (!MAPS_KEY) {
      setActiveView('list');
      return;
    }

    let cancelled = false;
    let insertedScript: HTMLScriptElement | null = null;
    const previousAuthFailure = window.gm_authFailure;
    const previousInitializer = window.initKhedmahMap;
    const failMap = (message: string) => {
      if (cancelled) return;
      setMapStatus('error');
      setMapError(message);
      clearMap();
      pendingLocation.current = undefined;
      geoSequence.current += 1;
      setLocating(false);
      setActiveView('list');
    };

    window.initKhedmahMap = () => {
      if (cancelled) return;
      initializeMapRef.current();
    };
    window.gm_authFailure = () => failMap('رفضت Google Maps مفتاح هذا النطاق. يمكنك متابعة البحث من النتائج إلى حين تصحيح الإعداد.');

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
    clearMap();
    setMapStatus('loading');
    setMapError('');
    setActiveView('map');
    setMapLoadAttempt((attempt) => attempt + 1);
  }

  function locateUser() {
    if (!navigator.geolocation) {
      setLocationStatus('تحديد الموقع غير مدعوم. يمكنك اختيار المدينة من عوامل البحث.');
      return;
    }
    const attempt = ++geoSequence.current;
    const owner = contextKey;
    sequence.current += 1;
    setLocating(true);
    setLocationStatus('جاري تحديد موقعك…');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (attempt !== geoSequence.current || owner !== latest.current.contextKey) return;
      const next = { latitude: coords.latitude, longitude: coords.longitude };
      const center = map.current?.getCenter();
      if (map.current && mapStatus === 'ready' && (!center || center.lat() !== next.latitude || center.lng() !== next.longitude)) {
        pendingLocation.current = next;
        programmaticView.current = true;
        // Read bounds after pan completes in idle, never from the old viewport.
        map.current.panTo({ lat: next.latitude, lng: next.longitude });
      } else {
        setLocation(next);
        setLocating(false);
        setLocationStatus('');
        navigate({ ...context, boundaries: map.current?.getBounds()?.toJSON(), invalidBounds: false });
      }
    }, () => {
      if (attempt !== geoSequence.current || owner !== latest.current.contextKey) return;
      setLocating(false);
      setLocationStatus('تعذر الوصول إلى موقعك. يمكنك تحريك الخريطة أو اختيار المدينة من عوامل البحث.');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  const resultsScope = context.boundaries ? 'ضمن المنطقة المحددة' : 'وفق عوامل البحث';
  const status = isLoading ? 'جاري تحديث النتائج…' : providers.length
    ? `عرض ${providers.length} من ${result.total} نشاط ${resultsScope}` : `لا توجد أنشطة مطابقة ${resultsScope}`;

  return <main className={`${styles.mapPage} ${activeView === 'list' ? styles.listView : ''}`} data-map-status={mapStatus} dir="rtl">
    <aside className={styles.mapPanel}>
      <header><Link className={styles.mapBrand} href="/">خدمة</Link><h1>الخدمات بالقرب منك</h1><p className={styles.meta}>حرّك الخريطة أو ابحث عن خدمة لعرض الأنشطة المنشورة ضمن المنطقة.</p></header>
      <nav className={styles.viewSwitch} aria-label="طريقة عرض النتائج">
        <ActionButton type="button" variant={activeView === 'map' ? 'primary' : 'secondary'} aria-pressed={activeView === 'map'} onClick={() => setActiveView('map')}><PlatformIcon name="pin" size={17}/> الخريطة</ActionButton>
        <ActionButton type="button" variant={activeView === 'list' ? 'primary' : 'secondary'} aria-pressed={activeView === 'list'} onClick={() => setActiveView('list')}><PlatformIcon name="grid" size={17}/> النتائج</ActionButton>
      </nav>
      <form role="search" aria-label="البحث عن الأنشطة على الخريطة" onSubmit={(event) => { event.preventDefault(); if (!context.invalidBounds) navigate({ ...context, q: query }); }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="الخدمة المطلوبة" placeholder="مثال: تصليح مكيف" />
        <ActionButton type="submit" disabled={context.invalidBounds}><PlatformIcon name="search" size={17}/> بحث</ActionButton>
      </form>
      <ActionButton variant="secondary" type="button" disabled={locating} onClick={locateUser}><PlatformIcon name="pin" size={17}/> استخدم موقعي الحالي</ActionButton>
      <p className={styles.meta}>الأنشطة المنشورة · {cityCode ? cityLabel(cityCode, cities) : 'كل المدن'} · {categoryCode ? categories.find((item) => item.code === categoryCode)?.nameAr ?? categoryCode : 'كل التصنيفات'}</p>
      <ActionLink variant="secondary" href={searchHref({ ...context, tab: 'business', page: 1 })}>تعديل عوامل البحث</ActionLink>
      {(context.boundaries || context.invalidBounds || viewportError) && <ActionButton type="button" variant="secondary" onClick={() => { setViewportError(''); navigate({ ...context, boundaries: undefined, invalidBounds: false }); }}>مسح تحديد المنطقة</ActionButton>}
      {locationStatus && <StatusMessage>{locationStatus}</StatusMessage>}
      {mapStatus === 'error' && <StatusMessage tone="warning">{mapError}</StatusMessage>}
      {viewportError && <StatusMessage tone="warning">{viewportError}</StatusMessage>}
      {error ? <StatusMessage tone="danger">{error} {!validationError && <ActionButton type="button" variant="secondary" onClick={() => setRetryCount((count) => count + 1)}>إعادة تحميل النتائج</ActionButton>}</StatusMessage> : <StatusMessage>{status}</StatusMessage>}
      {!!cityCode && citiesError && <ActionButton type="button" variant="secondary" onClick={() => void retryCities()}>إعادة تحميل المدن</ActionButton>}
      {!!categoryCode && categoriesError && <ActionButton type="button" variant="secondary" onClick={() => void retryCategories()}>إعادة تحميل التصنيفات</ActionButton>}
      {mapStatus === 'error' && MAPS_KEY && <div className={styles.mapRecovery}><ActionButton type="button" variant="secondary" onClick={retryMap}><PlatformIcon name="refresh" size={17}/> إعادة تشغيل الخريطة</ActionButton><span>يمكن محاولة تحميل النتائج دون الخريطة.</span></div>}
      <section className={styles.providerList} aria-label="مقدمو الخدمات" aria-busy={isLoading}>
        {providers.map((provider) => <Surface as="article" className={styles.provider} key={provider.id}>
          <div><h2>{provider.name} {provider.trustStatus === 'approved' && <span aria-label="موثّق">✓</span>}</h2><p>{provider.availability === 'available' ? 'متاح الآن' : provider.availability === 'busy' ? 'مشغول' : 'حسب الموعد'} · ⭐ {provider.rating ?? 0} {provider.distanceKm !== undefined && `· ${provider.distanceKm} كم`}</p></div>
          <ActionLink href={`/business-profiles/${encodeURIComponent(provider.id)}?source=map`}>عرض النشاط</ActionLink>
        </Surface>)}
      </section>
    </aside>
    <section className={styles.mapStage} aria-label="منطقة الخريطة">
      <div className={styles.mapCanvas} ref={mapNode} aria-label="خريطة مقدمي الخدمات" />
      {mapStatus !== 'ready' && <div className={styles.mapFallback} role={mapStatus === 'error' ? 'alert' : 'status'}>
        <PlatformIcon name="pin" size={34}/>
        <h2>{mapStatus === 'error' ? 'تعذر تشغيل الخريطة' : 'جاري تجهيز الخريطة'}</h2>
        <p>{mapStatus === 'error' ? mapError : 'لحظات ونحدد الخدمات الأقرب إليك.'}</p>
        {mapStatus === 'error' && <div className={styles.mapFallbackActions}>{MAPS_KEY && <ActionButton type="button" onClick={retryMap}>إعادة المحاولة</ActionButton>}<ActionButton type="button" variant="secondary" onClick={() => setActiveView('list')}>عرض النتائج</ActionButton></div>}
      </div>}
    </section>
  </main>;
}

export default function MarketplaceMapPage() {
  return <Suspense fallback={<main className={styles.mapPage} dir="rtl">جاري فتح الخريطة…</main>}><MapDiscovery /></Suspense>;
}
