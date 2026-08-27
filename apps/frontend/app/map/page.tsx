'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { api, PublicBusinessProfile } from '../../lib/api-client';
import { PlatformIcon } from '../components/platform-icon';
import { ActionButton, ActionLink, StatusMessage, Surface } from '../components/ui-primitives';
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
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [activeView, setActiveView] = useState<'map' | 'list'>('map');
  const [status, setStatus] = useState('جاري تحميل مقدمي الخدمات…');
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>(MAPS_KEY ? 'loading' : 'error');

  const search = useCallback(async (boundaries?: Bounds, nextLocation = location, nextQuery = query) => {
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
      setStatus(error instanceof Error ? error.message : 'تعذر تحميل مقدمي الخدمات');
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

  useEffect(renderMarkers, [renderMarkers]);
  useEffect(() => { void search(initialBounds, DEFAULT_LOCATION, initialQuery); }, []);
  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current); }, []);
  useEffect(() => {
    const previous = window.gm_authFailure;
    const previousInitializer = window.initKhedmahMap;
    window.initKhedmahMap = initializeMap;
    window.gm_authFailure = () => {
      setMapStatus('error');
      setStatus('تعذر تشغيل خريطة Google لهذا النطاق. يمكنك متابعة البحث من عرض النتائج.');
    };
    const timeout = window.setTimeout(() => {
      if (!map.current) setMapStatus('error');
    }, 12000);
    return () => {
      window.clearTimeout(timeout);
      window.gm_authFailure = previous;
      window.initKhedmahMap = previousInitializer;
    };
  }, [initializeMap]);

  function locateUser() {
    setStatus('جاري تحديد موقعك…');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const next = { latitude: coords.latitude, longitude: coords.longitude };
      setLocation(next);
      map.current?.panTo({ lat: next.latitude, lng: next.longitude });
      void search(map.current?.getBounds()?.toJSON(), next);
    }, () => setStatus('تعذر الوصول إلى موقعك. حرّك الخريطة يدوياً.'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  return <main className={`${styles.mapPage} ${activeView === 'list' ? styles.listView : ''}`} dir="rtl">
    {MAPS_KEY && <Script src={`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&language=ar&region=SY&loading=async&callback=initKhedmahMap`} strategy="afterInteractive" onError={() => setMapStatus('error')} />}
    <aside className={styles.mapPanel}>
      <header><Link className={styles.mapBrand} href="/">خدمة</Link><h1>الخدمات بالقرب منك</h1><p className={styles.meta}>حرّك الخريطة أو ابحث عن خدمة لعرض الأنشطة المنشورة ضمن المنطقة.</p></header>
      <nav className={styles.viewSwitch} aria-label="طريقة عرض النتائج">
        <ActionButton type="button" variant={activeView === 'map' ? 'primary' : 'secondary'} aria-pressed={activeView === 'map'} onClick={() => setActiveView('map')}><PlatformIcon name="pin" size={17}/> الخريطة</ActionButton>
        <ActionButton type="button" variant={activeView === 'list' ? 'primary' : 'secondary'} aria-pressed={activeView === 'list'} onClick={() => setActiveView('list')}><PlatformIcon name="grid" size={17}/> النتائج</ActionButton>
      </nav>
      <form onSubmit={(event) => { event.preventDefault(); void search(map.current?.getBounds()?.toJSON()); }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="الخدمة المطلوبة" placeholder="مثال: تصليح مكيف" />
        <ActionButton type="submit"><PlatformIcon name="search" size={17}/> بحث</ActionButton>
      </form>
      <ActionButton variant="secondary" type="button" onClick={locateUser}><PlatformIcon name="pin" size={17}/> استخدم موقعي الحالي</ActionButton>
      <StatusMessage tone={mapStatus === 'error' ? 'warning' : 'info'}>{mapStatus === 'error' ? 'الخريطة غير متاحة حالياً. استخدم عرض النتائج أو البحث العادي.' : status}</StatusMessage>
      <section className={styles.providerList} aria-label="مقدمو الخدمات">
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
        <p>{mapStatus === 'error' ? 'يمكنك متابعة البحث ومشاهدة الأنشطة من عرض النتائج إلى أن تعود الخريطة.' : 'لحظات ونحدد الخدمات الأقرب إليك.'}</p>
        {mapStatus === 'error' && <ActionButton type="button" onClick={() => setActiveView('list')}>عرض النتائج</ActionButton>}
      </div>}
    </section>
  </main>;
}

export default function MarketplaceMapPage() {
  return <Suspense fallback={<main className={styles.mapPage} dir="rtl">جاري فتح الخريطة…</main>}><MapDiscovery /></Suspense>;
}
