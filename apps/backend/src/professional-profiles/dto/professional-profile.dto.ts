export interface CreateProfessionalProfileRequest {
  readonly expectedContentRevision?: unknown;
  readonly headlineAr?: unknown;
  readonly headlineEn?: unknown;
  readonly bioAr?: unknown;
  readonly bioEn?: unknown;
  readonly availability?: unknown;
  /** Owner publication intent; omitted creates private and preserves existing visibility. */
  readonly visibility?: unknown;
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
  readonly visibility?: unknown;
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
