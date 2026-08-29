export interface CreateServiceRequest {
  readonly titleAr?: unknown;
  readonly titleEn?: unknown;
  readonly descriptionAr?: unknown;
  readonly descriptionEn?: unknown;
  readonly categoryCode?: unknown;
  readonly price?: unknown;
  readonly priceCurrency?: unknown;
  readonly priceType?: unknown;
  readonly ownerId?: unknown;
  readonly ownerType?: unknown;
  readonly ownerUserId?: unknown;
}

export interface UpdateServiceRequest {
  readonly titleAr?: unknown;
  readonly titleEn?: unknown;
  readonly descriptionAr?: unknown;
  readonly descriptionEn?: unknown;
  readonly categoryCode?: unknown;
  readonly price?: unknown;
  readonly priceCurrency?: unknown;
  readonly priceType?: unknown;
  readonly status?: unknown;
}

export interface SearchServicesRequest {
  readonly q?: unknown;
  readonly categoryCode?: unknown;
  readonly cityCode?: unknown;
  readonly page?: unknown;
}

export interface ListOwnerServicesRequest {
  readonly ownerType?: unknown;
}
