export type PlatformIconName = 'user' | 'userPlus' | 'lock' | 'search' | 'grid' | 'pin' | 'arrow' | 'logout';

const paths: Record<PlatformIconName, React.ReactNode> = {
  user: <><circle cx="12" cy="8" r="3"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></>,
  userPlus: <><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M18 8v6M15 11h6"/></>,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  arrow: <path d="M19 12H5m6-6-6 6 6 6"/>,
  logout: <><path d="M10 4H5v16h5M14 8l4 4-4 4m4-4H9"/></>
};

export function PlatformIcon({ name, size = 20 }: { name: PlatformIconName; size?: number }) {
  return <svg className="platform-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
