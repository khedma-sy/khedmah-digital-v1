interface SocialProviderIconProps {
  readonly provider: 'google' | 'facebook';
}

export function SocialProviderIcon({ provider }: SocialProviderIconProps) {
  if (provider === 'facebook') {
    return (
      <svg className="social-provider-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="12" fill="#1877f2" />
        <path fill="#fff" d="M13.7 20v-7h2.35l.35-2.74h-2.7V8.51c0-.8.22-1.33 1.36-1.33h1.45V4.73a19.4 19.4 0 0 0-2.12-.11c-2.1 0-3.54 1.28-3.54 3.64v2H8.48V13h2.37v7h2.85Z" />
      </svg>
    );
  }

  return (
    <svg className="social-provider-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z" />
      <path fill="#34a853" d="M12 22c2.7 0 4.98-.9 6.63-2.38l-3.24-2.53c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z" />
      <path fill="#fbbc05" d="M6.39 13.92A6.02 6.02 0 0 1 6.07 12c0-.67.12-1.32.32-1.92V7.47H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.53l3.35-2.61Z" />
      <path fill="#ea4335" d="M12 5.95c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.47l3.35 2.61C7.18 7.71 9.39 5.95 12 5.95Z" />
    </svg>
  );
}
