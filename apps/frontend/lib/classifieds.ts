import type { AdKind, AdListingBase, AdStatus } from './classifieds-client';

export const CLASSIFIEDS_ENABLED = process.env.NEXT_PUBLIC_CLASSIFIEDS_ENABLED === 'true';

export const AD_KIND_LABELS: Readonly<Record<AdKind, string>> = {
  sale: 'للبيع',
  service: 'خدمة',
  wanted: 'مطلوب',
  rent: 'للإيجار'
};

export const AD_STATUS_LABELS: Readonly<Record<AdStatus, string>> = {
  draft: 'مسودة',
  pending_review: 'قيد المراجعة',
  active: 'منشور',
  inactive: 'غير نشط',
  expired: 'منتهي',
  rejected: 'مطلوب تعديل'
};

export function formatAdPrice(ad: Pick<AdListingBase, 'priceMode' | 'priceMinor' | 'currency'>): string {
  if (ad.priceMode === 'fixed' && ad.priceMinor !== undefined && ad.currency) {
    return `${ad.priceMinor.toLocaleString('ar-SY')} ${ad.currency}`;
  }
  if (ad.priceMode === 'negotiable') return 'السعر قابل للتفاوض';
  if (ad.priceMode === 'contact') return 'تواصل لمعرفة السعر';
  return 'بدون سعر محدد';
}

export function requestId(storageKey: string): string {
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing && /^[A-Za-z0-9_-]{16,100}$/.test(existing)) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export function clearRequestId(storageKey: string): void {
  try { sessionStorage.removeItem(storageKey); } catch { /* Browser storage is optional. */ }
}
