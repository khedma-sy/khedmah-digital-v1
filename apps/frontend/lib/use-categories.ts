'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Category } from './api-client';

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setIsLoading(true); setError('');
    try {
      const result = await api.categories.list();
      if (requestId === requestSequence.current) setCategories(result.categories);
    } catch {
      if (requestId === requestSequence.current) setError('تعذر تحميل التصنيفات المعتمدة.');
    } finally {
      if (requestId === requestSequence.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Ignore superseded retries and completions after unmount or effect replay.
    return () => { requestSequence.current += 1; };
  }, [load]);
  return { categories, isLoading, error, retry: load };
}
