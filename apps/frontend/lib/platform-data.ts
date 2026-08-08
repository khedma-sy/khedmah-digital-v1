export type Province = { slug: string; name: string; subtitle: string; x: number; y: number };

export const provinces: Province[] = [
  { slug: 'damascus', name: 'دمشق', subtitle: 'العاصمة', x: 55, y: 75 },
  { slug: 'rif-dimashq', name: 'ريف دمشق', subtitle: 'محيط العاصمة', x: 63, y: 70 },
  { slug: 'aleppo', name: 'حلب', subtitle: 'الشمال', x: 48, y: 43 },
  { slug: 'homs', name: 'حمص', subtitle: 'الوسط', x: 50, y: 59 },
  { slug: 'hama', name: 'حماة', subtitle: 'الوسط', x: 43, y: 53 },
  { slug: 'latakia', name: 'اللاذقية', subtitle: 'الساحل', x: 25, y: 48 },
  { slug: 'tartus', name: 'طرطوس', subtitle: 'الساحل', x: 27, y: 57 },
  { slug: 'idlib', name: 'إدلب', subtitle: 'الشمال الغربي', x: 35, y: 45 },
  { slug: 'daraa', name: 'درعا', subtitle: 'الجنوب', x: 49, y: 87 },
  { slug: 'sweida', name: 'السويداء', subtitle: 'الجنوب', x: 66, y: 84 },
  { slug: 'quneitra', name: 'القنيطرة', subtitle: 'الجنوب الغربي', x: 39, y: 79 },
  { slug: 'deir-ez-zor', name: 'دير الزور', subtitle: 'الشرق', x: 72, y: 57 },
  { slug: 'raqqa', name: 'الرقة', subtitle: 'الشمال الشرقي', x: 69, y: 47 },
  { slug: 'hasakah', name: 'الحسكة', subtitle: 'الجزيرة', x: 86, y: 39 }
];

export const serviceCategories = [
  { icon: '✚', name: 'الصحة', description: 'أطباء، مراكز طبية، صيدليات', color: 'cyan' },
  { icon: '◇', name: 'التعليم', description: 'مدارس، حضانات، معاهد', color: 'violet' },
  { icon: '▱', name: 'البناء', description: 'مواد بناء، مهندسون، مقاولون', color: 'orange' },
  { icon: '✦', name: 'الجمال', description: 'صالونات وخدمات تجميل', color: 'pink' },
  { icon: '◉', name: 'المناسبات', description: 'أعراس، صالات، تصوير', color: 'gold' },
  { icon: '▦', name: 'التجارة', description: 'تجزئة، جملة، مستودعات، موردون', color: 'blue' },
  { icon: '</>', name: 'التكنولوجيا', description: 'برمجة، مواقع، خدمات رقمية', color: 'cyan' },
  { icon: '◆', name: 'السيارات', description: 'تأجير، صيانة، خدمات', color: 'violet' }
];

export function provinceBySlug(slug: string) {
  return provinces.find((province) => province.slug === slug);
}
