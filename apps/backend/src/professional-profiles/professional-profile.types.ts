export type ProfessionalAvailability = 'available' | 'busy' | 'unavailable';

export interface ProfessionalProfile {
  readonly id: string;
  readonly userId: string;
  readonly headlineAr: string;
  readonly headlineEn?: string;
  readonly bioAr?: string;
  readonly bioEn?: string;
  readonly availability: ProfessionalAvailability;
  readonly cityCode: string;
  readonly countryCode: string;
  readonly skills: readonly string[];
  readonly isFeatured: boolean;
  readonly featuredAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PublicProfessionalProfile {
  readonly id: string;
  readonly headlineAr: string;
  readonly headlineEn?: string;
  readonly bioAr?: string;
  readonly bioEn?: string;
  readonly availability: ProfessionalAvailability;
  readonly cityCode: string;
  readonly countryCode: string;
  readonly skills: readonly string[];
  readonly isFeatured: boolean;
  readonly createdAt: string;
}
