export const KHEDMAH_WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb8OwhVGOj9gPtjqdO0c';
export const KHEDMAH_FACEBOOK_URL = 'https://www.facebook.com/khedma.uk';

export function officialWhatsappContactUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_KHEDMAH_WHATSAPP_CONTACT_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'wa.me' || !/^\/\d{8,15}$/.test(url.pathname) || url.search || url.hash) return null;
    return url.toString();
  } catch { return null; }
}
