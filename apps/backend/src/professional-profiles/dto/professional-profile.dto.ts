export interface CreateProfessionalProfileRequest {
  readonly headlineAr?: unknown;
  readonly headlineEn?: unknown;
  readonly bioAr?: unknown;
  readonly bioEn?: unknown;
  readonly availability?: unknown;
  readonly cityCode?: unknown;
  readonly countryCode?: unknown;
  readonly skills?: unknown;
}

export interface UpdateProfessionalProfileRequest {
  readonly headlineAr?: unknown;
  readonly headlineEn?: unknown;
  readonly bioAr?: unknown;
  readonly bioEn?: unknown;
  readonly availability?: unknown;
  readonly cityCode?: unknown;
  readonly countryCode?: unknown;
  readonly skills?: unknown;
}

export interface SearchProfessionalProfilesRequest {
  readonly q?: unknown;
  readonly cityCode?: unknown;
  readonly availability?: unknown;
  readonly page?: unknown;
}
