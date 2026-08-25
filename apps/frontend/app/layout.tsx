import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { AuthNavigation } from './auth-navigation';
import { BrandMark } from './components/brand-mark';
import './globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://khedmah.digital';
const SITE_NAME = 'خدمة ديجتل';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — دليل الأعمال`,
    template: `%s | ${SITE_NAME}`
  },
  description: 'خدمة منصة عربية لاكتشاف الأعمال والمهنيين والخدمات الموثوقة والتواصل معهم بسهولة.',
  applicationName: 'Khedmah Digital V1',
  keywords: ['أعمال', 'مهنيين', 'خدمات', 'دليل', 'سوريا', 'عربي', 'khedmah', 'خدمة'],
  authors: [{ name: 'Khedmah Digital' }],
  creator: 'Khedmah Digital',
  publisher: 'Khedmah Digital',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true }
  },
  openGraph: {
    type: 'website',
    locale: 'ar_SY',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — دليل الأعمال`,
    description: 'منصة الأعمال الرقمية العربية — اكتشف الأعمال والمهنيين والخدمات.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'خدمة ديجتل' }]
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — دليل الأعمال`,
    description: 'منصة الأعمال الرقمية العربية.',
    images: ['/og-image.png']
  },
  alternates: {
    canonical: SITE_URL,
    languages: { ar: '/' }
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
        <header className="khedma-header">
          <Link href="/" aria-label="خدمة - الرئيسية"><BrandMark compact /></Link>
          <AuthNavigation />
        </header>
        {children}
      </body>
    </html>
  );
}
