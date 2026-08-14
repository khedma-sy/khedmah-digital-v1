'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, City } from './api-client';

export function useSyrianCities() {
  const [cities, setCities] = useState<City[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const result = await api.locations.cities();
      setCities(result.cities.filter((city) => city.countryCode === 'SY'));
    } catch {
      setCities([]);
      setError('تعذر تحميل المدن المعتمدة. يمكنك متابعة البحث دون تحديد مدينة.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  return { cities, isLoading, error, retry: load };
}

export function canonicalCityCode(value: string | null, cities: readonly City[]): string {
  return value && cities.some((city) => city.code === value && city.countryCode === 'SY') ? value : '';
}

export function cityLabel(code: string, cities: readonly City[]): string {
  return cities.find((city) => city.code === code)?.nameAr ?? code;
}
