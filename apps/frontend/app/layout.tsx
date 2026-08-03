import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'خدمة الرقمية — دليل الأعمال',
  description: 'منصة الأعمال الرقمية العربية — اكتشف الأعمال والمهنيين والخدمات.',
  applicationName: 'Khedmah Digital V1',
  alternates: {
    languages: {
      ar: '/'
    }
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <a className="skip-link" href="#foundation-content">
          الانتقال إلى المحتوى
        </a>
        <nav className="global-nav" aria-label="التنقل الرئيسي">
          <Link href="/" className="global-nav-brand">خدمة الرقمية</Link>
          <div className="global-nav-links">
            <Link href="/search">البحث</Link>
            <Link href="/businesses/new" style={{ display: 'none' }} aria-hidden="true">.</Link>
            <Link href="/business-profiles">أعمالي</Link>
            <Link href="/professional-profiles">ملفي</Link>
            <Link href="/service-catalog">الخدمات</Link>
            <Link href="/auth/login" className="nav-cta">دخول</Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
