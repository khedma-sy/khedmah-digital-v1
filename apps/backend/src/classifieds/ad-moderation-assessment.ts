import type { AdListing } from './ad.types';

export const CLASSIFIEDS_SMART_ADMIN_VERSION = 'classifieds-smart-admin-v1' as const;

export type AdModerationSignalCode =
  | 'NO_DESCRIPTION'
  | 'NO_IMAGE'
  | 'UNLINKED_BUSINESS'
  | 'DIRECT_CONTACT'
  | 'PROFILE_WITHOUT_BUSINESS'
  | 'PRICE_CONTRACT_MISMATCH'
  | 'REVIEW_REVISION_INVALID';

export interface AdModerationSignal {
  readonly code: AdModerationSignalCode;
  readonly level: 'info' | 'attention';
  readonly messageAr: string;
}

export interface AdModerationAssessment {
  readonly version: typeof CLASSIFIEDS_SMART_ADMIN_VERSION;
  readonly reviewRevision: number;
  readonly priority: 'standard' | 'elevated';
  readonly completeness: 'complete' | 'needs_attention';
  readonly humanDecisionRequired: true;
  readonly automatedDecisionAllowed: false;
  readonly signals: readonly AdModerationSignal[];
  readonly summaryAr: string;
}

export function assessAdForModeration(ad: AdListing): AdModerationAssessment {
  const signals: AdModerationSignal[] = [];
  const add = (code: AdModerationSignalCode, level: AdModerationSignal['level'], messageAr: string) => {
    signals.push({ code, level, messageAr });
  };

  if (!ad.descriptionAr?.trim()) {
    add('NO_DESCRIPTION', 'attention', 'لا يوجد وصف إضافي؛ يلزم فحص العنوان والصور والسياق بعناية قبل القرار.');
  }
  if (ad.imageUrls.length === 0) {
    add('NO_IMAGE', 'attention', 'الإعلان لا يحتوي صورة مراجعة حالية.');
  }
  if (!ad.businessProfileId) {
    add('UNLINKED_BUSINESS', 'info', 'الإعلان غير مرتبط بملف نشاط تجاري على خدمة.');
  }
  if (ad.contactMode === 'phone' || ad.contactMode === 'whatsapp') {
    add('DIRECT_CONTACT', 'info', 'الإعلان يعرض وسيلة تواصل مباشرة؛ راجع مطابقة بيانات التواصل للمحتوى.');
  }
  if (ad.contactMode === 'profile' && !ad.businessProfileId) {
    add('PROFILE_WITHOUT_BUSINESS', 'attention', 'طريقة التواصل عبر الملف تتطلب وجود ملف نشاط مرتبط.');
  }
  if ((ad.priceMode === 'fixed' || ad.priceMode === 'negotiable') &&
      (!Number.isSafeInteger(ad.priceMinor) || (ad.priceMinor ?? 0) < 0 || !ad.currency)) {
    add('PRICE_CONTRACT_MISMATCH', 'attention', 'بيانات السعر لا تطابق عقد السعر للإعلان.');
  }
  if (!Number.isSafeInteger(ad.reviewRevision) || ad.reviewRevision <= 0) {
    add('REVIEW_REVISION_INVALID', 'attention', 'نسخة المراجعة غير صالحة؛ لا يجوز تنفيذ قرار على هذه اللقطة.');
  }

  const attentionCount = signals.filter((signal) => signal.level === 'attention').length;
  const completeness = attentionCount === 0 ? 'complete' : 'needs_attention';
  return {
    version: CLASSIFIEDS_SMART_ADMIN_VERSION,
    reviewRevision: ad.reviewRevision,
    priority: attentionCount === 0 ? 'standard' : 'elevated',
    completeness,
    humanDecisionRequired: true,
    automatedDecisionAllowed: false,
    signals,
    summaryAr: completeness === 'complete'
      ? 'اكتملت فحوص البنية الأساسية. يلزم قرار المشرف الصريح بعد مراجعة المحتوى.'
      : `رُصدت ${attentionCount} إشارة تتطلب انتباه المشرف قبل اتخاذ القرار.`
  };
}
