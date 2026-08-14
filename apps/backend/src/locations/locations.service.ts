import { Injectable, NotFoundException } from '@nestjs/common';
import { CITY_NOT_FOUND_MESSAGE } from './location.errors';
import { City, Country } from './location.types';

const CITIES: readonly City[] = [
  { code: 'damascus', nameAr: 'دمشق', nameEn: 'Damascus', countryCode: 'SY' },
  { code: 'aleppo', nameAr: 'حلب', nameEn: 'Aleppo', countryCode: 'SY' },
  { code: 'homs', nameAr: 'حمص', nameEn: 'Homs', countryCode: 'SY' },
  { code: 'latakia', nameAr: 'اللاذقية', nameEn: 'Latakia', countryCode: 'SY' },
  { code: 'hama', nameAr: 'حماة', nameEn: 'Hama', countryCode: 'SY' },
  { code: 'deir-ez-zor', nameAr: 'دير الزور', nameEn: 'Deir ez-Zor', countryCode: 'SY' },
  { code: 'tartus', nameAr: 'طرطوس', nameEn: 'Tartus', countryCode: 'SY' },
  { code: 'idlib', nameAr: 'إدلب', nameEn: 'Idlib', countryCode: 'SY' },
  { code: 'raqqa', nameAr: 'الرقة', nameEn: 'Raqqa', countryCode: 'SY' },
  { code: 'daraa', nameAr: 'درعا', nameEn: 'Daraa', countryCode: 'SY' },
  { code: 'rif-dimashq', nameAr: 'ريف دمشق', nameEn: 'Rif Dimashq', countryCode: 'SY' },
  { code: 'hasakah', nameAr: 'الحسكة', nameEn: 'Al-Hasakah', countryCode: 'SY' },
  { code: 'quneitra', nameAr: 'القنيطرة', nameEn: 'Quneitra', countryCode: 'SY' },
  { code: 'suwayda', nameAr: 'السويداء', nameEn: 'As-Suwayda', countryCode: 'SY' }
];

const COUNTRIES: readonly Country[] = [
  { code: 'SY', nameAr: 'سوريا', nameEn: 'Syria' },
  { code: 'SA', nameAr: 'المملكة العربية السعودية', nameEn: 'Saudi Arabia' },
  { code: 'AE', nameAr: 'الإمارات', nameEn: 'UAE' },
  { code: 'JO', nameAr: 'الأردن', nameEn: 'Jordan' },
  { code: 'LB', nameAr: 'لبنان', nameEn: 'Lebanon' },
  { code: 'EG', nameAr: 'مصر', nameEn: 'Egypt' },
  { code: 'IQ', nameAr: 'العراق', nameEn: 'Iraq' },
  { code: 'KW', nameAr: 'الكويت', nameEn: 'Kuwait' },
  { code: 'QA', nameAr: 'قطر', nameEn: 'Qatar' },
  { code: 'BH', nameAr: 'البحرين', nameEn: 'Bahrain' },
  { code: 'OM', nameAr: 'عُمان', nameEn: 'Oman' },
  { code: 'YE', nameAr: 'اليمن', nameEn: 'Yemen' },
  { code: 'TR', nameAr: 'تركيا', nameEn: 'Turkey' },
  { code: 'DE', nameAr: 'ألمانيا', nameEn: 'Germany' },
  { code: 'SE', nameAr: 'السويد', nameEn: 'Sweden' }
];

export function isSyrianCityCode(value: string): boolean {
  return CITIES.some((city) => city.code === value && city.countryCode === 'SY');
}

@Injectable()
export class LocationsService {
  listCities(): readonly City[] {
    return CITIES;
  }

  listCountries(): readonly Country[] {
    return COUNTRIES;
  }

  getCity(code: string): City {
    const city = CITIES.find((item) => item.code === code);
    if (!city) {
      throw new NotFoundException(CITY_NOT_FOUND_MESSAGE);
    }
    return city;
  }
}
