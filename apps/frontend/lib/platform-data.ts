export type Province = { slug: string; name: string; subtitle: string; mapId: string };

export const provinces: Province[] = [
  { slug: 'damascus', name: 'دمشق', subtitle: 'العاصمة', mapId: 'damascus' },
  { slug: 'rif-dimashq', name: 'ريف دمشق', subtitle: 'محيط العاصمة', mapId: 'rif-dimashq' },
  { slug: 'aleppo', name: 'حلب', subtitle: 'الشمال', mapId: 'aleppo' },
  { slug: 'homs', name: 'حمص', subtitle: 'الوسط', mapId: 'homs' },
  { slug: 'hama', name: 'حماة', subtitle: 'الوسط', mapId: 'hama' },
  { slug: 'latakia', name: 'اللاذقية', subtitle: 'الساحل', mapId: 'latakia' },
  { slug: 'tartus', name: 'طرطوس', subtitle: 'الساحل', mapId: 'tartus' },
  { slug: 'idlib', name: 'إدلب', subtitle: 'الشمال الغربي', mapId: 'idlib' },
  { slug: 'daraa', name: 'درعا', subtitle: 'الجنوب', mapId: 'daraa' },
  { slug: 'sweida', name: 'السويداء', subtitle: 'الجنوب', mapId: 'sweida' },
  { slug: 'quneitra', name: 'القنيطرة', subtitle: 'الجنوب الغربي', mapId: 'quneitra' },
  { slug: 'deir-ez-zor', name: 'دير الزور', subtitle: 'الشرق', mapId: 'deir-ez-zor' },
  { slug: 'raqqa', name: 'الرقة', subtitle: 'الشمال الشرقي', mapId: 'raqqa' },
  { slug: 'hasakah', name: 'الحسكة', subtitle: 'الجزيرة', mapId: 'hasakah' }
];
