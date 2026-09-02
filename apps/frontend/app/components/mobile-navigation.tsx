'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PlatformIcon, type PlatformIconName } from './platform-icon';

const items: Array<{ href: string; label: string; icon: PlatformIconName; active(pathname: string): boolean }> = [
  { href: '/', label: 'الرئيسية', icon: 'home', active: (pathname) => pathname === '/' },
  { href: '/search', label: 'اكتشف', icon: 'compass', active: (pathname) => pathname === '/search' || pathname === '/categories' || pathname === '/map' },
  { href: '/restaurants', label: 'الطعام', icon: 'food', active: (pathname) => pathname.startsWith('/restaurants') || pathname.startsWith('/orders') },
  { href: '/mobility', label: 'التوصيل', icon: 'delivery', active: (pathname) => pathname.startsWith('/mobility') },
  { href: '/users/me', label: 'حسابي', icon: 'user', active: (pathname) => pathname.startsWith('/users') || pathname.startsWith('/business-profiles') },
];

export function MobileNavigation() {
  const pathname = usePathname();
  return <nav className="mobile-navigation" aria-label="التنقل الرئيسي للهاتف">{items.map((item) => <Link key={item.href} href={item.href} aria-current={item.active(pathname) ? 'page' : undefined}><PlatformIcon name={item.icon} size={20}/><span>{item.label}</span></Link>)}</nav>;
}
