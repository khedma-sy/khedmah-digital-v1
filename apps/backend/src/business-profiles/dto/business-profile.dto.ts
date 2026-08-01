export interface CreateBusinessProfileRequest {
  readonly name?: unknown;
  readonly descriptionAr?: unknown;
  readonly descriptionEn?: unknown;
  readonly phone?: unknown;
  readonly email?: unknown;
  readonly website?: unknown;
  readonly categoryCode?: unknown;
  readonly cityCode?: unknown;
  readonly countryCode?: unknown;
}

export interface UpdateBusinessProfileRequest {
  readonly name?: unknown;
  readonly descriptionAr?: unknown;
  readonly descriptionEn?: unknown;
  readonly phone?: unknown;
  readonly email?: unknown;
  readonly website?: unknown;
  readonly visibility?: unknown;
  readonly categoryCode?: unknown;
  readonly cityCode?: unknown;
  readonly countryCode?: unknown;
}

export interface UpdateTrustStatusRequest {
  readonly trustStatus?: unknown;
}

export interface SearchBusinessProfilesRequest {
  readonly q?: unknown;
  readonly categoryCode?: unknown;
  readonly cityCode?: unknown;
  readonly page?: unknown;
}
