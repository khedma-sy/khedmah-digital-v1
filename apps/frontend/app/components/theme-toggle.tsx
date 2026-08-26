'use client';

import { useEffect, useState } from 'react';

type ThemePreference = 'system' | 'light' | 'dark';

const options: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'حسب الجهاز' },
  { value: 'light', label: 'نهاري' },
  { value: 'dark', label: 'مظلم' }
];

function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  const dark = preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.themePreference = preference;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>('system');

  useEffect(() => {
    const stored = localStorage.getItem('khedma-theme');
    const initial: ThemePreference = stored === 'light' || stored === 'dark' ? stored : 'system';
    setPreference(initial);
    applyTheme(initial);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const syncSystem = () => document.documentElement.dataset.themePreference === 'system' && applyTheme('system');
    media.addEventListener('change', syncSystem);
    return () => media.removeEventListener('change', syncSystem);
  }, []);

  function choose(next: ThemePreference) {
    setPreference(next);
    if (next === 'system') localStorage.removeItem('khedma-theme');
    else localStorage.setItem('khedma-theme', next);
    applyTheme(next);
  }

  return <fieldset className="theme-toggle" aria-label="مظهر المنصة">
    <legend className="sr-only">اختر مظهر المنصة</legend>
    {options.map((option) => <button type="button" key={option.value} aria-pressed={preference === option.value} title={option.label} onClick={() => choose(option.value)}>
      <span aria-hidden="true">{option.value === 'system' ? '◐' : option.value === 'light' ? '○' : '●'}</span>
      <span className="theme-toggle-label">{option.label}</span>
    </button>)}
  </fieldset>;
}
