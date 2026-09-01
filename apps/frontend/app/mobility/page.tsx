'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, type PublicBusinessProfile } from '../../lib/api-client';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../components/ui-primitives';
import { PlatformIcon } from '../components/platform-icon';
import styles from './mobility.module.css';

type Coordinates = { latitude: number; longitude: number };
type Place = { formatted_address?: string; geometry?: { location?: { lat(): number; lng(): number } } };
type Autocomplete = { addListener(name: 'place_changed', callback: () => void): void; getPlace(): Place };
type MobilityMapsApi = {
  places?: { Autocomplete: new (input: HTMLInputElement, options: object) => Autocomplete };
  Geocoder?: new () => { geocode(request: object, callback: (results: Array<{ formatted_address?: string }> | null, status: string) => void): void };
};
type MobilityWindow = Window & { google?: { maps?: MobilityMapsApi }; initKhedmahMobility?: () => void };

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
const SCRIPT_ID = 'khedmah-google-maps';
const categoryFor = (type: 'taxi' | 'delivery') => type === 'taxi' ? 'taxi' : 'delivery_courier';

export default function MobilityPage() {
  const pickupInput = useRef<HTMLInputElement>(null);
  const destinationInput = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<'taxi' | 'delivery'>('taxi');
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [pickupCoordinates, setPickupCoordinates] = useState<Coordinates>();
  const [providers, setProviders] = useState<PublicBusinessProfile[]>([]);
  const [placesReady, setPlacesReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [message, setMessage] = useState(MAPS_KEY ? 'اكتب العنوان واختره من اقتراحات Google.' : 'اقتراحات Google غير مهيأة حاليًا؛ استخدم موقعك الحالي للبحث القريب.');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('type') === 'delivery') setType('delivery');
  }, []);

  useEffect(() => {
    if (!MAPS_KEY) return;
    const runtime = window as MobilityWindow;
    let cancelled = false;
    let pickupAutocomplete: Autocomplete | undefined;
    let destinationAutocomplete: Autocomplete | undefined;

    const initialize = () => {
      if (cancelled || !runtime.google?.maps?.places || !pickupInput.current || !destinationInput.current) return;
      pickupAutocomplete = new runtime.google.maps.places.Autocomplete(pickupInput.current, { fields: ['formatted_address', 'geometry'], componentRestrictions: { country: 'sy' } });
      destinationAutocomplete = new runtime.google.maps.places.Autocomplete(destinationInput.current, { fields: ['formatted_address', 'geometry'], componentRestrictions: { country: 'sy' } });
      pickupAutocomplete.addListener('place_changed', () => {
        const place = pickupAutocomplete?.getPlace();
        const location = place?.geometry?.location;
        if (!location) return setMessage('اختر موقع الانطلاق من قائمة اقتراحات Google.');
        setPickup(place.formatted_address ?? pickupInput.current?.value ?? '');
        setPickupCoordinates({ latitude: location.lat(), longitude: location.lng() });
        setMessage('تم تحديد موقع الانطلاق.');
      });
      destinationAutocomplete.addListener('place_changed', () => {
        const place = destinationAutocomplete?.getPlace();
        setDestination(place?.formatted_address ?? destinationInput.current?.value ?? '');
      });
      setPlacesReady(true);
    };

    runtime.initKhedmahMobility = initialize;
    if (runtime.google?.maps?.places) initialize();
    else {
      const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      if (existing) existing.addEventListener('load', initialize, { once: true });
      else {
        const script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.async = true;
        script.defer = true;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&language=ar&region=SY&libraries=places&loading=async&callback=initKhedmahMobility`;
        script.onerror = () => setMessage('تعذر تحميل اقتراحات Google. استخدم موقعك الحالي أو حاول لاحقًا.');
        document.head.appendChild(script);
      }
    }
    return () => {
      cancelled = true;
      delete runtime.initKhedmahMobility;
    };
  }, []);

  function useCurrentLocation() {
    setMessage('جاري تحديد موقع الانطلاق…');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const coordinates = { latitude: coords.latitude, longitude: coords.longitude };
      setPickupCoordinates(coordinates);
      const fallback = `${coordinates.latitude.toFixed(6)},${coordinates.longitude.toFixed(6)}`;
      const maps = (window as MobilityWindow).google?.maps;
      if (!maps?.Geocoder) {
        setPickup(fallback);
        setMessage('تم تحديد موقعك الحالي.');
        return;
      }
      new maps.Geocoder().geocode({ location: { lat: coordinates.latitude, lng: coordinates.longitude } }, (results, status) => {
        const address = status === 'OK' ? results?.[0]?.formatted_address : undefined;
        setPickup(address ?? fallback);
        setMessage('تم تحديد موقعك الحالي.');
      });
    }, () => setMessage('تعذر الوصول إلى موقعك. فعّل إذن الموقع ثم حاول مجددًا.'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  async function findProviders(event: FormEvent) {
    event.preventDefault();
    if (!pickupCoordinates) {
      setMessage('استخدم موقعك الحالي أو اختر موقع الانطلاق من اقتراحات Google أولًا.');
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const result = await api.search.query({
        categoryCode: categoryFor(type),
        type: 'business',
        map: true,
        latitude: pickupCoordinates.latitude,
        longitude: pickupCoordinates.longitude
      });
      setProviders(result.businesses.slice(0, 12));
      setMessage(result.businesses.length ? 'هذه أقرب الأنشطة المعتمدة إلى موقع الانطلاق.' : 'لا يوجد مزود معتمد لهذا النوع قربك حاليًا.');
    } catch (cause) {
      setProviders([]);
      setMessage(cause instanceof Error ? cause.message : 'تعذر البحث عن مقدمي الخدمة.');
    } finally {
      setLoading(false);
    }
  }

  function openRoute() {
    if (!pickup || !destination) {
      setMessage('أدخل موقع الانطلاق والوجهة لفتح المسار.');
      return;
    }
    const route = new URL('https://www.google.com/maps/dir/');
    route.searchParams.set('api', '1');
    route.searchParams.set('origin', pickup);
    route.searchParams.set('destination', destination);
    route.searchParams.set('travelmode', 'driving');
    window.open(route.toString(), '_blank', 'noopener,noreferrer');
  }

  return <PageShell className={styles.page} label="التاكسي والتوصيل">
    <PageHeader eyebrow="بحث حسب الموقع" title="تاكسي ومندوب توصيل" description="حدد نقطة الانطلاق لتجد الأنشطة المعتمدة الأقرب، ثم تواصل معها مباشرة. لا توجد رحلة مؤكدة قبل قبول المزود." backHref="/"/>
    <Surface as="form" className={styles.planner} onSubmit={findProviders}>
      <div className={styles.typeSwitch} aria-label="نوع الخدمة">
        <ActionButton type="button" variant={type === 'taxi' ? 'primary' : 'secondary'} aria-pressed={type === 'taxi'} onClick={() => { setType('taxi'); setProviders([]); setSearched(false); }}><PlatformIcon name="car"/> تاكسي</ActionButton>
        <ActionButton type="button" variant={type === 'delivery' ? 'primary' : 'secondary'} aria-pressed={type === 'delivery'} onClick={() => { setType('delivery'); setProviders([]); setSearched(false); }}><PlatformIcon name="cart"/> مندوب توصيل</ActionButton>
      </div>
      <div className={styles.fields}>
        <label>موقع الانطلاق<input ref={pickupInput} value={pickup} onChange={(event) => { setPickup(event.target.value); setPickupCoordinates(undefined); }} placeholder="اختر عنوانًا من Google" autoComplete="off"/></label>
        <label>الوجهة<input ref={destinationInput} value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="إلى أين؟" autoComplete="off"/></label>
      </div>
      <div className={styles.actions}>
        <ActionButton type="button" variant="secondary" onClick={useCurrentLocation}><PlatformIcon name="pin"/> استخدم موقعي</ActionButton>
        <ActionButton type="submit" disabled={loading}><PlatformIcon name="search"/> {loading ? 'جاري البحث…' : `ابحث عن ${type === 'taxi' ? 'تاكسي' : 'مندوب'}`}</ActionButton>
        <ActionButton type="button" variant="secondary" onClick={openRoute}><PlatformIcon name="pin"/> افتح المسار في Google</ActionButton>
      </div>
      <StatusMessage tone={placesReady || pickupCoordinates ? 'info' : 'warning'}>{message}</StatusMessage>
    </Surface>

    {loading ? <SkeletonGrid count={4} label="جاري البحث عن مزودي الخدمة"/> : providers.length ? <section className={styles.results} aria-label="مزودو النقل والتوصيل">
      {providers.map((provider) => <Surface as="article" className={styles.provider} key={provider.id}>
        <div><span className={styles.badge}>{type === 'taxi' ? 'تاكسي' : 'توصيل'}</span><h2>{provider.name}</h2><p>{provider.addressAr ?? provider.cityCode}{provider.distanceKm !== undefined ? ` · ${provider.distanceKm.toFixed(1)} كم` : ''}</p></div>
        <div className={styles.providerActions}><ActionLink href={`/business-profiles/${encodeURIComponent(provider.id)}?source=mobility`}>عرض النشاط والتواصل</ActionLink>{provider.phone && <a href={`tel:${provider.phone}`}>اتصال</a>}</div>
      </Surface>)}
    </section> : searched && <EmptyState icon={<PlatformIcon name={type === 'taxi' ? 'car' : 'cart'} size={34}/>} title="لا يوجد مزود معتمد قريب حاليًا" description="يمكنك توسيع البحث عبر الخريطة أو العودة لاحقًا بعد انضمام مزودين جدد." actions={<><ActionLink href={`/map?q=${encodeURIComponent(type === 'taxi' ? 'تاكسي' : 'مندوب توصيل')}`}>البحث على الخريطة</ActionLink><ActionLink href="/business-profiles/new" variant="secondary">سجّل نشاط نقل أو توصيل</ActionLink></>}/>} 
    <p className={styles.disclaimer}>خدمة تعرض مزودي الخدمة وتسهّل الاتصال فقط؛ الاتفاق والسعر والقبول يتم مباشرة مع المزود. <Link href="/search">عرض كل الخدمات</Link></p>
  </PageShell>;
}
