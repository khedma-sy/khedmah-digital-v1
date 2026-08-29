import { Inject, Injectable } from '@nestjs/common';
import { BusinessProfileRepository } from '../business-profiles/business-profile.repository';
import { PublicBusinessProfile } from '../business-profiles/business-profile.types';
import { ServiceCatalogRepository } from '../service-catalog/service-catalog.repository';
import { PublicServiceListing } from '../service-catalog/service-catalog.types';
import { PublicSearchRequest } from './dto/search.dto';
import { SearchResults } from './search.types';
import { validatePublicSearchRequest } from './search.validation';
import { rankProviders } from './provider-ranking';

@Injectable()
export class SearchService {
  constructor(
    @Inject(BusinessProfileRepository) private readonly businessProfiles: BusinessProfileRepository,
    @Inject(ServiceCatalogRepository) private readonly services: ServiceCatalogRepository
  ) {}

  async search(request: PublicSearchRequest): Promise<SearchResults> {
    const input = validatePublicSearchRequest(request);
    const limit = 20;
    const offset = (input.page - 1) * limit;
    let businesses: readonly PublicBusinessProfile[] = [];
    let services: readonly PublicServiceListing[] = [];
    let total = 0;

    if (input.type === 'all' || input.type === 'business') {
      const businessLimit = input.map ? 200 : limit;
      const businessOffset = input.map ? 0 : offset;
      const [profiles, profileTotal] = await Promise.all([
        this.businessProfiles.listPublicApproved({ q: input.q, categoryCode: input.categoryCode, cityCode: input.cityCode, boundaries: input.boundaries }, businessLimit, businessOffset),
        this.businessProfiles.countPublicApproved({ q: input.q, categoryCode: input.categoryCode, cityCode: input.cityCode, boundaries: input.boundaries })
      ]);
      businesses = rankProviders(profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        descriptionAr: profile.descriptionAr,
        descriptionEn: profile.descriptionEn,
        visibility: profile.visibility,
        moderationStatus: profile.moderationStatus,
        trustStatus: profile.trustStatus,
        status: profile.status,
        phone: profile.phone,
        email: profile.email,
        website: profile.website,
        categoryCode: profile.categoryCode,
        cityCode: profile.cityCode,
        countryCode: profile.countryCode,
        lat: profile.lat,
        lng: profile.lng,
        addressAr: profile.addressAr,
        isFeatured: profile.isFeatured,
        serviceRadius: profile.serviceRadius,
        availability: profile.availability,
        rating: profile.rating,
        responseSpeedMinutes: profile.responseSpeedMinutes,
        createdAt: profile.createdAt
      })), input.q, input.latitude !== undefined && input.longitude !== undefined ? { latitude: input.latitude, longitude: input.longitude } : undefined);
      total += profileTotal;
    }

    if (input.type === 'all' || input.type === 'service') {
      const [listings, listingTotal] = await Promise.all([
        this.services.listPublicEligible({ q: input.q, categoryCode: input.categoryCode, cityCode: input.cityCode }, limit, offset),
        this.services.countPublicEligible({ q: input.q, categoryCode: input.categoryCode, cityCode: input.cityCode })
      ]);
      services = listings.map((service) => ({
        id: service.id,
        ownerType: service.ownerType,
        ownerId: service.ownerId,
        titleAr: service.titleAr,
        titleEn: service.titleEn,
        descriptionAr: service.descriptionAr,
        descriptionEn: service.descriptionEn,
        categoryCode: service.categoryCode,
        price: service.price,
        priceCurrency: service.priceCurrency,
        priceType: service.priceType,
        status: service.status,
        isFeatured: service.isFeatured,
        createdAt: service.createdAt
      }));
      total += listingTotal;
    }

    return { businesses, services, total };
  }
}
