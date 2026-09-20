'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, City } from './api-client';

export function useSyrianCities() {
  const [cities, setCities] = useState<City[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setIsLoading(true);
    setError('');
    try {
      const result = await api.locations.cities();
      if (requestId === requestSequence.current) setCities(result.cities.filter((city) => city.countryCode === 'SY'));
    } catch {
      if (requestId === requestSequence.current) setError('تعذر تحميل المدن المعتمدة. أعد المحاولة للاحتفاظ بالمدينة المحددة، أو امسحها للبحث في كل المدن.');
    } finally {
      if (requestId === requestSequence.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [load]);
  return { cities, isLoading, error, retry: load };
}

export function canonicalCityCode(value: string | null, cities: readonly City[]): string {
  return value && cities.some((city) => city.code === value && city.countryCode === 'SY') ? value : '';
}

export function cityLabel(code: string, cities: readonly City[]): string {
  return cities.find((city) => city.code === code)?.nameAr ?? code;
}
