import { Inject, Injectable } from '@nestjs/common';
import { BusinessProfileRepository } from '../business-profiles/business-profile.repository';
import { PublicBusinessProfile } from '../business-profiles/business-profile.types';
import { ServiceCatalogRepository } from '../service-catalog/service-catalog.repository';
import { PublicServiceListing } from '../service-catalog/service-catalog.types';
import { PublicSearchRequest } from './dto/search.dto';
import { SearchResults } from './search.types';
import { validatePublicSearchRequest } from './search.validation';

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
      const [profiles, profileTotal] = await Promise.all([
        this.businessProfiles.listPublicApproved({ q: input.q, categoryCode: input.categoryCode, cityCode: input.cityCode }, limit, offset),
        this.businessProfiles.countPublicApproved({ q: input.q, categoryCode: input.categoryCode, cityCode: input.cityCode })
      ]);
      businesses = profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        descriptionAr: profile.descriptionAr,
        descriptionEn: profile.descriptionEn,
        visibility: profile.visibility,
        trustStatus: profile.trustStatus,
        status: profile.status,
        phone: profile.phone,
        email: profile.email,
        website: profile.website,
        categoryCode: profile.categoryCode,
        cityCode: profile.cityCode,
        countryCode: profile.countryCode
      }));
      total += profileTotal;
    }

    if (input.type === 'all' || input.type === 'service') {
      const [listings, listingTotal] = await Promise.all([
        this.services.listPublicEligible({ q: input.q, categoryCode: input.categoryCode }, limit, offset),
        this.services.countPublicEligible({ q: input.q, categoryCode: input.categoryCode })
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
        status: service.status
      }));
      total += listingTotal;
    }

    return { businesses, services, total };
  }
}
