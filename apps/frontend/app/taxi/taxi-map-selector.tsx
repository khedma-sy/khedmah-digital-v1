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
type MapsWindow = Window & { google?: { maps?: MapsApi } };

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
const MAP_SCRIPT_ID = 'khedmah-google-maps';

const pointFor = (address: TaxiAddress): LatLngLiteral => ({ lat: address.latitude, lng: address.longitude });
const valid = (point: LatLngLiteral) => Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;

export function TaxiMapSelector({ pickup, dropoff, onPickupChange, onDropoffChange }: {
  pickup: TaxiAddress;
  dropoff: TaxiAddress;
  onPickupChange(value: TaxiAddress): void;
  onDropoffChange(value: TaxiAddress): void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance>();
  const pickupMarkerRef = useRef<MarkerInstance>();
  const dropoffMarkerRef = useRef<MarkerInstance>();
  const lineRef = useRef<PolylineInstance>();
  const listenersRef = useRef<MapsListener[]>([]);
  const selectionRef = useRef<'pickup' | 'dropoff'>('pickup');
  const pickupRef = useRef(pickup);
  const dropoffRef = useRef(dropoff);
  const [selection, setSelection] = useState<'pickup' | 'dropoff'>('pickup');
  const [ready, setReady] = useState(false);
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
    if (!MAPS_KEY || !element.current) return;
    const runtime = window as MapsWindow;
    let cancelled = false;
    let script = document.getElementById(MAP_SCRIPT_ID) as HTMLScriptElement | null;

    const fail = () => {
      if (cancelled) return;
      setReady(false);
      setMessage('تعذر تحميل خريطة التكسي. استخدم موقعي الحالي أو الإدخال اليدوي مؤقتًا.');
    };

    const initialize = () => {
      if (cancelled || mapRef.current || !element.current) return;
      const maps = runtime.google?.maps;
      if (!maps) return;
      try {
        const start = pointFor(pickupRef.current);
        const end = pointFor(dropoffRef.current);
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
        pickupMarkerRef.current = new maps.Marker({ map, position: start, draggable: true, title: 'نقطة الانطلاق' });
        dropoffMarkerRef.current = new maps.Marker({ map, position: end, draggable: true, title: 'الوجهة' });
        lineRef.current = new maps.Polyline({ map, path: [start, end], strokeColor: '#07427c', strokeOpacity: .9, strokeWeight: 4, geodesic: true });
        listenersRef.current.push(map.addListener('click', (event) => {
          const position = event.latLng;
          if (!position) return;
          applyPoint(selectionRef.current, { lat: position.lat(), lng: position.lng() });
        }));
        listenersRef.current.push(pickupMarkerRef.current.addListener('dragend', (event) => {
          const position = event.latLng;
          if (position) applyPoint('pickup', { lat: position.lat(), lng: position.lng() });
        }));
        listenersRef.current.push(dropoffMarkerRef.current.addListener('dragend', (event) => {
          const position = event.latLng;
          if (position) applyPoint('dropoff', { lat: position.lat(), lng: position.lng() });
        }));
        fitRoute(maps);
        setReady(true);
      } catch { fail(); }
    };

    if (runtime.google?.maps) initialize();
    else {
      if (!script) {
        script = document.createElement('script');
        script.id = MAP_SCRIPT_ID;
        script.async = true;
        script.defer = true;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&language=ar&region=SY&loading=async`;
        document.head.appendChild(script);
      }
      script.addEventListener('load', initialize);
      script.addEventListener('error', fail);
    }
    const timeout = window.setTimeout(() => { if (!mapRef.current) fail(); }, 15000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      script?.removeEventListener('load', initialize);
      script?.removeEventListener('error', fail);
      listenersRef.current.forEach(listener => listener.remove());
      listenersRef.current = [];
      pickupMarkerRef.current?.setMap(null);
      dropoffMarkerRef.current?.setMap(null);
      lineRef.current?.setMap(null);
      pickupMarkerRef.current = undefined;
      dropoffMarkerRef.current = undefined;
      lineRef.current = undefined;
      mapRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    const runtime = window as MapsWindow;
    const maps = runtime.google?.maps;
    const map = mapRef.current;
    if (!ready || !maps || !map) return;
    const start = pointFor(pickup);
    const end = pointFor(dropoff);
    if (valid(start)) pickupMarkerRef.current?.setPosition(start);
    if (valid(end)) dropoffMarkerRef.current?.setPosition(end);
    if (valid(start) && valid(end)) {
      lineRef.current?.setPath([start, end]);
      fitRoute(maps);
    } else if (valid(start)) map.setCenter(start);
  }, [pickup.latitude, pickup.longitude, dropoff.latitude, dropoff.longitude, ready]);

  return <section className={styles.mapPanel} aria-label="خريطة رحلة التكسي">
    <div className={styles.mapToolbar}>
      <button type="button" className={selection === 'pickup' ? styles.mapPointActive : ''} onClick={() => { setSelection('pickup'); setMessage('انقر على الخريطة لتحديد نقطة الانطلاق.'); }}><PlatformIcon name="pin" size={17}/> تحديد الانطلاق</button>
      <button type="button" className={selection === 'dropoff' ? styles.mapPointActive : ''} onClick={() => { setSelection('dropoff'); setMessage('انقر على الخريطة لتحديد الوجهة.'); }}><PlatformIcon name="pin" size={17}/> تحديد الوجهة</button>
    </div>
    <div ref={element} className={styles.mapCanvas} aria-label="خريطة Google لاختيار الانطلاق والوجهة" />
    <p className={ready ? styles.mapMessage : styles.mapWarning}>{message}</p>
  </section>;
}
