'use client';

import { useEffect, useRef, useState } from 'react';
import type { TaxiAddress } from '../../lib/taxi-client';
import { PlatformIcon } from '../components/platform-icon';
import styles from './taxi.module.css';

type LatLngLiteral = { lat: number; lng: number };
type MapsListener = { remove(): void };
type MapClickEvent = { latLng?: { lat(): number; lng(): number } };
type MapInstance = {
  addListener(name: 'click', callback: (event: MapClickEvent) => void): MapsListener;
  addListener(name: 'tilesloaded', callback: () => void): MapsListener;
  setCenter(point: LatLngLiteral): void;
  fitBounds(bounds: LatLngBoundsInstance, padding?: number): void;
};
type MarkerInstance = {
  addListener(name: 'dragend', callback: (event: MapClickEvent) => void): MapsListener;
  setPosition(point: LatLngLiteral): void;
  setMap(map: MapInstance | null): void;
};
type PolylineInstance = {
  setPath(path: LatLngLiteral[]): void;
  setMap(map: MapInstance | null): void;
};
type LatLngBoundsInstance = { extend(point: LatLngLiteral): void };
type MapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Marker: new (options: Record<string, unknown>) => MarkerInstance;
  Polyline: new (options: Record<string, unknown>) => PolylineInstance;
  LatLngBounds: new () => LatLngBoundsInstance;
};
type MapStatus = 'loading' | 'ready' | 'unavailable';

declare global {
  interface Window {
    initKhedmahTaxiMap?: () => void;
  }
}

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
const MAP_SCRIPT_ID = 'khedmah-google-maps';

const pointFor = (address: TaxiAddress): LatLngLiteral => ({ lat: address.latitude, lng: address.longitude });
const valid = (point: LatLngLiteral) => Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;
const mapsRuntime = () => window.google?.maps as unknown as MapsApi | undefined;

export function TaxiMapSelector({ pickup, dropoff, onPickupChange, onDropoffChange }: {
  pickup: TaxiAddress;
  dropoff: TaxiAddress;
  onPickupChange(value: TaxiAddress): void;
  onDropoffChange(value: TaxiAddress): void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const renderedRef = useRef(false);
  const pickupMarkerRef = useRef<MarkerInstance | null>(null);
  const dropoffMarkerRef = useRef<MarkerInstance | null>(null);
  const lineRef = useRef<PolylineInstance | null>(null);
  const listenersRef = useRef<MapsListener[]>([]);
  const selectionRef = useRef<'pickup' | 'dropoff'>('pickup');
  const pickupRef = useRef(pickup);
  const dropoffRef = useRef(dropoff);
  const [selection, setSelection] = useState<'pickup' | 'dropoff'>('pickup');
  const [mapStatus, setMapStatus] = useState<MapStatus>(MAPS_KEY ? 'loading' : 'unavailable');
  const [message, setMessage] = useState(MAPS_KEY ? 'اختر نقطة الانطلاق ثم الوجهة على الخريطة.' : 'خريطة Google غير مهيأة في هذه البيئة.');

  pickupRef.current = pickup;
  dropoffRef.current = dropoff;
  selectionRef.current = selection;

  function applyPoint(target: 'pickup' | 'dropoff', point: LatLngLiteral) {
    if (!valid(point)) return;
    if (target === 'pickup') {
      const current = pickupRef.current;
      onPickupChange({ ...current, latitude: point.lat, longitude: point.lng });
      setSelection('dropoff');
      setMessage('تم تحديد نقطة الانطلاق. حدد الوجهة على الخريطة.');
    } else {
      const current = dropoffRef.current;
      onDropoffChange({ ...current, latitude: point.lat, longitude: point.lng });
      setMessage('تم تحديد الوجهة. يمكنك تعديل أي نقطة بالسحب أو بالنقر بعد اختيارها.');
    }
  }

  function fitRoute(maps: MapsApi) {
    const map = mapRef.current;
    if (!map) return;
    const start = pointFor(pickupRef.current);
    const end = pointFor(dropoffRef.current);
    if (!valid(start) || !valid(end)) return;
    const bounds = new maps.LatLngBounds();
    bounds.extend(start); bounds.extend(end);
    map.fitBounds(bounds, 56);
  }

  useEffect(() => {
    const mapsKey = MAPS_KEY;
    if (!mapsKey || !element.current) return;
    let cancelled = false;
    let insertedScript: HTMLScriptElement | null = null;
    const previousAuthFailure = window.gm_authFailure;
    const previousInitializer = window.initKhedmahTaxiMap;

    const fail = (nextMessage = 'تعذر تحميل خريطة التكسي. استخدم موقعي الحالي أو الإدخال اليدوي مؤقتًا.') => {
      if (cancelled) return;
      renderedRef.current = false;
      setMapStatus('unavailable');
      setMessage(nextMessage);
    };

    const initialize = () => {
      if (cancelled || mapRef.current || !element.current) return;
      const maps = mapsRuntime();
      if (!maps) {
        fail();
        return;
      }
      try {
        const start = pointFor(pickupRef.current);
        const center = valid(start) ? start : { lat: 33.5138, lng: 36.2765 };
        const map = new maps.Map(element.current, {
          center,
          zoom: 13,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          clickableIcons: false
        });
        mapRef.current = map;
        renderedRef.current = false;
        listenersRef.current.push(map.addListener('tilesloaded', () => {
          if (cancelled || mapRef.current !== map) return;
          renderedRef.current = true;
          setMapStatus('ready');
          setMessage('اختر نقطة الانطلاق ثم الوجهة على الخريطة.');
        }));
        listenersRef.current.push(map.addListener('click', (event) => {
          const position = event.latLng;
          if (!position) return;
          applyPoint(selectionRef.current, { lat: position.lat(), lng: position.lng() });
        }));
      } catch {
        fail('تعذر تجهيز خريطة التكسي. استخدم موقعي الحالي أو الإدخال اليدوي مؤقتًا.');
      }
    };

    const authFailure = () => fail('رفضت Google Maps مفتاح هذا النطاق. استخدم الإدخال اليدوي مؤقتًا إلى حين تصحيح الإعداد.');
    window.initKhedmahTaxiMap = initialize;
    window.gm_authFailure = authFailure;

    if (mapsRuntime()) {
      initialize();
    } else {
      document.getElementById(MAP_SCRIPT_ID)?.remove();
      insertedScript = document.createElement('script');
      insertedScript.id = MAP_SCRIPT_ID;
      insertedScript.async = true;
      insertedScript.defer = true;
      insertedScript.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsKey)}&language=ar&region=SY&loading=async&callback=initKhedmahTaxiMap`;
      insertedScript.onerror = () => fail('تعذر الاتصال بخدمة خرائط Google. استخدم الإدخال اليدوي مؤقتًا.');
      document.head.appendChild(insertedScript);
    }

    const timeout = window.setTimeout(() => {
      if (!renderedRef.current) fail('استغرق تحميل خريطة التكسي وقتًا أطول من المتوقع. استخدم الإدخال اليدوي مؤقتًا.');
    }, 20000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (window.gm_authFailure === authFailure) window.gm_authFailure = previousAuthFailure;
      if (window.initKhedmahTaxiMap === initialize) window.initKhedmahTaxiMap = previousInitializer;
      if (insertedScript && !mapsRuntime()) insertedScript.remove();
      listenersRef.current.forEach(listener => listener.remove());
      listenersRef.current = [];
      pickupMarkerRef.current?.setMap(null);
      dropoffMarkerRef.current?.setMap(null);
      lineRef.current?.setMap(null);
      pickupMarkerRef.current = null;
      dropoffMarkerRef.current = null;
      lineRef.current = null;
      mapRef.current = null;
      renderedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const start = pointFor(pickup);
    const end = pointFor(dropoff);
    if (valid(start) && !valid(end) && selectionRef.current === 'pickup') {
      setSelection('dropoff');
    }
  }, [pickup.latitude, pickup.longitude, dropoff.latitude, dropoff.longitude]);

  useEffect(() => {
    const maps = mapsRuntime();
    const map = mapRef.current;
    if (mapStatus !== 'ready' || !maps || !map) return;
    const start = pointFor(pickup);
    const end = pointFor(dropoff);

    if (valid(start)) {
      if (!pickupMarkerRef.current) {
        const marker = new maps.Marker({ map, position: start, draggable: true, title: 'نقطة الانطلاق' });
        pickupMarkerRef.current = marker;
        listenersRef.current.push(marker.addListener('dragend', (event) => {
          const position = event.latLng;
          if (position) applyPoint('pickup', { lat: position.lat(), lng: position.lng() });
        }));
      } else pickupMarkerRef.current.setPosition(start);
    } else if (pickupMarkerRef.current) {
      pickupMarkerRef.current.setMap(null);
      pickupMarkerRef.current = null;
    }

    if (valid(end)) {
      if (!dropoffMarkerRef.current) {
        const marker = new maps.Marker({ map, position: end, draggable: true, title: 'الوجهة' });
        dropoffMarkerRef.current = marker;
        listenersRef.current.push(marker.addListener('dragend', (event) => {
          const position = event.latLng;
          if (position) applyPoint('dropoff', { lat: position.lat(), lng: position.lng() });
        }));
      } else dropoffMarkerRef.current.setPosition(end);
    } else if (dropoffMarkerRef.current) {
      dropoffMarkerRef.current.setMap(null);
      dropoffMarkerRef.current = null;
    }

    if (valid(start) && valid(end)) {
      if (!lineRef.current) lineRef.current = new maps.Polyline({ map, path: [start, end], strokeColor: '#07427c', strokeOpacity: .9, strokeWeight: 4, geodesic: true });
      else lineRef.current.setPath([start, end]);
      fitRoute(maps);
    } else {
      lineRef.current?.setMap(null);
      lineRef.current = null;
      if (valid(start)) map.setCenter(start);
      else if (valid(end)) map.setCenter(end);
    }
  }, [pickup.latitude, pickup.longitude, dropoff.latitude, dropoff.longitude, mapStatus]);

  return <section className={styles.mapPanel} aria-label="خريطة رحلة التكسي" data-taxi-map-surface data-taxi-map-status={mapStatus}>
    <div className={styles.mapToolbar}>
      <button type="button" className={selection === 'pickup' ? styles.mapPointActive : ''} onClick={() => { setSelection('pickup'); setMessage('انقر على الخريطة لتحديد نقطة الانطلاق.'); }}><PlatformIcon name="pin" size={17}/> تحديد الانطلاق</button>
      <button type="button" className={selection === 'dropoff' ? styles.mapPointActive : ''} onClick={() => { setSelection('dropoff'); setMessage('انقر على الخريطة لتحديد الوجهة.'); }}><PlatformIcon name="pin" size={17}/> تحديد الوجهة</button>
    </div>
    <div ref={element} className={styles.mapCanvas} aria-label="خريطة Google لاختيار الانطلاق والوجهة" />
    <p className={mapStatus === 'ready' ? styles.mapMessage : styles.mapWarning}>{message}</p>
  </section>;
}
