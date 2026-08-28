'use client';

import { useEffect, useState } from 'react';

type ThemePreference = 'system' | 'light' | 'dark';

const options: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'حسب الجهاز' },
  { value: 'light', label: 'نهاري' },
  { value: 'dark', label: 'مظلم' }
];

const icons: Record<ThemePreference, string> = { system: '◐', light: '○', dark: '●' };

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

  const currentIndex = options.findIndex((option) => option.value === preference);
  const current = options[currentIndex];
  const next = options[(currentIndex + 1) % options.length];

  return <button
    type="button"
    className="theme-toggle"
    aria-label={`المظهر الحالي: ${current.label}. اضغط للتبديل إلى ${next.label}`}
    title={`المظهر: ${current.label}`}
    onClick={() => choose(next.value)}
  >
    <span className="theme-toggle-icon" aria-hidden="true">{icons[preference]}</span>
    <span className="sr-only">{current.label}</span>
  </button>;
}
