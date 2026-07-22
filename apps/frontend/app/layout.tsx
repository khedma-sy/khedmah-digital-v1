import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Khedmah Digital V1',
  description: 'Arabic-first RTL platform foundation for Khedmah Digital V1.',
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
        {children}
      </body>
    </html>
  );
}
