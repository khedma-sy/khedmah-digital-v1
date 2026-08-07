import type { Metadata } from 'next';
import { CompanyShowcase, CompanyShowcaseData } from '../../components/company-showcase';

export const metadata: Metadata = {
  title: 'خدمة ديجتل — الشركة المؤسسة',
  description: 'الملف الرسمي للشركة المؤسسة لمنصة خدمة ديجتل، المظلة الرقمية للأعمال والمهنيين ومقدمي الخدمات.'
};

const KHEDMAH_DIGITAL: CompanyShowcaseData = {
  nameAr: 'خدمة ديجتل',
  nameEn: 'KHEDMA DIGITAL',
  founderLabel: 'الشركة المؤسسة لمنصة خدمة ديجتل',
  description: 'خدمة ديجتل منصة رقمية تجمع الأعمال والمهنيين ومقدمي الخدمات تحت مظلة واحدة.',
  location: 'سوريا · منصة رقمية',
  services: [
    {
      title: 'اكتشاف الأعمال',
      description: 'حضور عام احترافي يساعد العملاء على الوصول إلى الأعمال والخدمات المناسبة.'
    },
    {
      title: 'ملفات المهنيين',
      description: 'مساحة موثوقة لعرض الخبرات المهنية والتخصصات والخدمات بصورة واضحة.'
    },
    {
      title: 'دليل الخدمات',
      description: 'تنظيم الخدمات وربطها بمقدميها ومواقعها لتسهيل البحث واتخاذ القرار.'
    },
    {
      title: 'الثقة والشراكات',
      description: 'أساس رقمي يدعم التحقق وبناء العلاقات ونمو الشركاء ضمن المنصة.'
    }
  ]
};

export default function KhedmahDigitalFounderProfilePage() {
  return <CompanyShowcase company={KHEDMAH_DIGITAL} />;
}
