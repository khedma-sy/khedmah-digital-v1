export const KHEDMAH_WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb8OwhVGOj9gPtjqdO0c';
export const KHEDMAH_WHATSAPP_CONTACT_URL = 'https://wa.me/qr/NVHTJ3SCG3SOD1';
export const KHEDMAH_FACEBOOK_URL = 'https://www.facebook.com/khedma.uk';
export const KHEDMAH_INSTAGRAM_URL = 'https://www.instagram.com/khedmasy/';
export const KHEDMAH_THREADS_URL = 'https://www.threads.com/@khedmasy';
export const KHEDMAH_TELEGRAM_URL = 'https://t.me/KHEDMASYRIA';
export const KHEDMAH_YOUTUBE_URL = 'https://www.youtube.com/@khedma-q5d';

export function officialWhatsappContactUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_KHEDMAH_WHATSAPP_CONTACT_URL?.trim() || KHEDMAH_WHATSAPP_CONTACT_URL;
  try {
    const url = new URL(value);
    const isPhoneLink = /^\/\d{8,15}$/.test(url.pathname);
    const isContactQrLink = /^\/qr\/[A-Z0-9]{10,32}$/.test(url.pathname);
    if (url.protocol !== 'https:' || url.hostname !== 'wa.me' || (!isPhoneLink && !isContactQrLink) || url.search || url.hash) return null;
    return url.toString();
  } catch { return null; }
}
