'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { api, PublicBusinessProfile } from '../../lib/api-client';

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
declare global { interface Window { google?: { maps: MapsApi } } }

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
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

  function locateUser() {
    setStatus('جاري تحديد موقعك…');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const next = { latitude: coords.latitude, longitude: coords.longitude };
      setLocation(next);
      map.current?.panTo({ lat: next.latitude, lng: next.longitude });
      void search(map.current?.getBounds()?.toJSON(), next);
    }, () => setStatus('تعذر الوصول إلى موقعك. حرّك الخريطة يدوياً.'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  return <main className={`marketplace-map view-${activeView}`} dir="rtl">
    {MAPS_KEY && <Script src={`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&language=ar&region=SY`} strategy="afterInteractive" onLoad={initializeMap} />}
    <aside className="map-results">
      <header><Link href="/">خدمة ديجتل</Link><h1>الخدمات حولك</h1></header>
      <nav className="map-view-switch" aria-label="طريقة عرض النتائج">
        <button type="button" aria-pressed={activeView === 'map'} onClick={() => setActiveView('map')}>الخريطة</button>
        <button type="button" aria-pressed={activeView === 'list'} onClick={() => setActiveView('list')}>النتائج</button>
      </nav>
      <form onSubmit={(event) => { event.preventDefault(); void search(map.current?.getBounds()?.toJSON()); }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="الخدمة المطلوبة" placeholder="مثال: تصليح مكيف" />
        <button type="submit">بحث</button>
      </form>
      <button className="locate-button" type="button" onClick={locateUser}>◎ استخدم موقعي الحالي</button>
      <p role="status">{MAPS_KEY ? status : 'يلزم إعداد مفتاح Google Maps العام لتشغيل الخريطة.'}</p>
      <section className="provider-map-list" aria-label="مقدمو الخدمات">
        {providers.map((provider) => <article key={provider.id}>
          <div><h2>{provider.name} {provider.trustStatus === 'approved' && <span aria-label="موثّق">✓</span>}</h2><p>{provider.availability === 'available' ? 'متاح الآن' : provider.availability === 'busy' ? 'مشغول' : 'حسب الموعد'} · ⭐ {provider.rating ?? 0} {provider.distanceKm !== undefined && `· ${provider.distanceKm} كم`}</p></div>
          <Link href={`/business-profiles/${encodeURIComponent(provider.id)}?source=map`}>عرض وطلب</Link>
        </article>)}
      </section>
    </aside>
    <div className="google-map" ref={mapNode} aria-label="خريطة مقدمي الخدمات" />
  </main>;
}

export default function MarketplaceMapPage() {
  return <Suspense fallback={<main className="marketplace-map-loading" dir="rtl">جاري فتح الخريطة…</main>}><MapDiscovery /></Suspense>;
}
