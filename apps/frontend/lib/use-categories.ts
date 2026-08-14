'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, Category } from './api-client';

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true); setError('');
    try { setCategories((await api.categories.list()).categories); }
    catch { setError('تعذر تحميل التصنيفات المعتمدة.'); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  return { categories, isLoading, error, retry: load };
}
