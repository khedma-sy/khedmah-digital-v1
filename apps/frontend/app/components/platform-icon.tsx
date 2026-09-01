export type PlatformIconName = 'user' | 'userPlus' | 'lock' | 'search' | 'grid' | 'pin' | 'arrow' | 'logout' | 'check' | 'close' | 'mail' | 'phone' | 'eye' | 'home' | 'car' | 'cart' | 'tools' | 'briefcase' | 'bell' | 'menu' | 'filter' | 'refresh' | 'food' | 'health' | 'education' | 'beauty' | 'technology' | 'construction' | 'events' | 'agriculture' | 'industry' | 'travel';

const paths: Record<PlatformIconName, React.ReactNode> = {
  user: <><circle cx="12" cy="8" r="3"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></>,
  userPlus: <><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M18 8v6M15 11h6"/></>,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  arrow: <path d="M19 12H5m6-6-6 6 6 6"/>,
  logout: <><path d="M10 4H5v16h5M14 8l4 4-4 4m4-4H9"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></>,
  phone: <path d="M7 3h3l1.5 4-2 1.5a15 15 0 0 0 6 6L17 12l4 1.5v3c0 2-1.5 3.5-3.5 3.5A14.5 14.5 0 0 1 4 6.5C4 4.5 5 3 7 3Z"/>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
  home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/></>,
  car: <><path d="m5 16-1-3 2-6h12l2 6-1 3"/><path d="M3 13h18v5H3zM6 18v2m12-2v2"/></>,
  cart: <><path d="M3 4h2l2 11h11l2-7H6"/><circle cx="9" cy="19" r="1"/><circle cx="17" cy="19" r="1"/></>,
  tools: <><path d="m14 6 4-4 4 4-4 4M3 21l9-9"/><path d="M5 3a4 4 0 0 0 5 5L21 19l-2 2L8 10a4 4 0 0 1-5-5Z"/></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 12h18M10 12v2h4v-2"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8Z"/>,
  refresh: <><path d="M20 7v5h-5"/><path d="M18.2 16.5A8 8 0 1 1 20 12"/></>
  ,food: <><path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M16 3v18M16 3c3 2 4 5 4 8h-4"/></>
  ,health: <><path d="M12 21S4 16.5 4 9.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8 3.5C20 16.5 12 21 12 21Z"/><path d="M9 11h6M12 8v6"/></>
  ,education: <><path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11.5V16c3 2 9 2 12 0v-4.5M22 9v6"/></>
  ,beauty: <><path d="M12 3c1.5 3 4 5.5 7 7-3 1.5-5.5 4-7 7-1.5-3-4-5.5-7-7 3-1.5 5.5-4 7-7Z"/><path d="M19 16c.6 1.2 1.5 2.1 3 3-1.5.9-2.4 1.8-3 3-.6-1.2-1.5-2.1-3-3 1.5-.9 2.4-1.8 3-3Z"/></>
  ,technology: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M8 10l2 2-2 2M13 14h3"/></>
  ,construction: <><path d="M3 21h18M5 21V9l7-6 7 6v12M9 21v-6h6v6"/><path d="M8 10h2M14 10h2"/></>
  ,events: <><path d="m4 21 4-11 6 6L4 21ZM14 4l1 3M20 9l-3 1M18 3l-2 2M10 3l1 3"/><path d="M14 16c4-1 6-4 6-8"/></>
  ,agriculture: <><path d="M12 21V9M12 13c-5 0-8-3-8-8 5 0 8 3 8 8ZM12 17c5 0 8-3 8-8-5 0-8 3-8 8Z"/></>
  ,industry: <><path d="M3 21V9l6 3V8l6 4V5h6v16H3Z"/><path d="M7 16h2M12 16h2M17 16h2"/></>
  ,travel: <><path d="M4 19h16M6 19l2-8h8l2 8M9 11V5a3 3 0 0 1 6 0v6"/><path d="M10 15h4"/></>
};

export function PlatformIcon({ name, size = 20 }: { name: PlatformIconName; size?: number }) {
  return <svg className="platform-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
