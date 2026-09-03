import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { AuthNavigation } from './auth-navigation';
import { BrandMark } from './components/brand-mark';
import { ThemeToggle } from './components/theme-toggle';
import { SmartAssistant } from './components/smart-assistant';
import { LaunchCampaignBanner } from './components/launch-campaign-banner';
import { MobileNavigation } from './components/mobile-navigation';
import './globals.css';
import './brand-system.css';
import './design-tokens.css';
import './ui-primitives.css';
import './auth-experience.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://khedmah.digital';
const SITE_NAME = 'خدمة';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — دليل الأعمال`,
    template: `%s | ${SITE_NAME}`
  },
  description: 'خدمة منصة عربية لاكتشاف الأعمال والمهنيين والخدمات الموثوقة والتواصل معهم بسهولة.',
  applicationName: 'خدمة',
  keywords: ['أعمال', 'مهنيين', 'خدمات', 'دليل', 'سوريا', 'عربي', 'khedmah', 'خدمة'],
  authors: [{ name: 'خدمة' }],
  creator: 'خدمة',
  publisher: 'خدمة',
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
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'خدمة' }]
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
  const themeScript = `(function(){try{var p=localStorage.getItem('khedma-theme');var v=p==='light'||p==='dark'?p:'system';var d=v==='dark'||(v==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.dataset.themePreference=v;r.dataset.theme=d?'dark':'light';r.style.colorScheme=d?'dark':'light'}catch(e){}})()`;
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <a className="skip-link" href="#foundation-content">
          الانتقال إلى المحتوى
        </a>
        <LaunchCampaignBanner />
        <header className="khedma-header">
          <Link href="/" aria-label="خدمة - الرئيسية"><BrandMark compact /></Link>
          <div className="khedma-header-actions"><AuthNavigation /><ThemeToggle /></div>
        </header>
        {children}
        <MobileNavigation />
        <SmartAssistant />
      </body>
    </html>
  );
}
