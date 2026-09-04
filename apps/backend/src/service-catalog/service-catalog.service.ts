import { randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { BusinessProfileRepository } from '../business-profiles/business-profile.repository';
import { MediaAsset } from '../business-profiles/business-profile.types';
import { ProfessionalProfileRepository } from '../professional-profiles/professional-profile.repository';
import { CategoryService } from '../categories/category.service';
import { SERVICE_ACCESS_DENIED_MESSAGE, SERVICE_NOT_FOUND_MESSAGE } from './service-catalog.errors';
import { ServiceCatalogRepository } from './service-catalog.repository';
import { PublicServiceListing, ServiceListing } from './service-catalog.types';
import { CreateServiceRequest, ListOwnerServicesRequest, SearchServicesRequest, UpdateServiceRequest } from './dto/service-catalog.dto';
import { validateCreateServiceRequest, validateOwnerServicesRequest, validateServiceSearchRequest, validateUpdateServiceRequest } from './service-catalog.validation';

@Injectable()
export class ServiceCatalogService {
  constructor(
    @Inject(ServiceCatalogRepository) private readonly repository: ServiceCatalogRepository,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(BusinessProfileRepository) private readonly businessProfiles: BusinessProfileRepository,
    @Inject(ProfessionalProfileRepository) private readonly professionalProfiles: ProfessionalProfileRepository,
    @Inject(CategoryService) private readonly categories: CategoryService
  ) {}

  async create(cookieHeader: string | undefined, request: CreateServiceRequest): Promise<PublicServiceListing> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const input = validateCreateServiceRequest(request);
    await this.categories.assertActiveCategory(input.categoryCode);
    if (actor.id != input.ownerUserId) {
      throw new ForbiddenException(SERVICE_ACCESS_DENIED_MESSAGE);
    }

    if (input.ownerType === 'business') {
      const owner = await this.businessProfiles.findById(input.ownerId);
      if (!owner) {
        throw new NotFoundException('Business profile was not found.');
      }
      if (owner.ownerUserId !== actor.id) {
        throw new ForbiddenException(SERVICE_ACCESS_DENIED_MESSAGE);
      }
    } else {
      const owner = await this.professionalProfiles.findById(input.ownerId);
      if (!owner) {
        throw new NotFoundException('Professional profile was not found.');
      }
      if (owner.userId !== actor.id) {
        throw new ForbiddenException(SERVICE_ACCESS_DENIED_MESSAGE);
      }
    }

    const now = new Date().toISOString();
    const service: ServiceListing = {
      id: randomUUID(),
      ownerId: input.ownerId,
      ownerType: input.ownerType,
      titleAr: input.titleAr,
      titleEn: input.titleEn,
      descriptionAr: input.descriptionAr,
      descriptionEn: input.descriptionEn,
      categoryCode: input.categoryCode,
      price: input.price,
      priceCurrency: input.priceCurrency,
      priceType: input.priceType,
      status: 'active',
      isFeatured: false,
      createdAt: now,
      updatedAt: now
    };

    await this.repository.save(service);
    return this.toPublic(await this.repository.findById(service.id) ?? service);
  }

  async listForOwner(cookieHeader: string | undefined, ownerId: string, request: ListOwnerServicesRequest): Promise<PublicServiceListing[]> {
    const input = validateOwnerServicesRequest(request);
    const session = await this.identity.getSession(readSessionToken(cookieHeader));
    if (session && await this.verifyOwnership(input.ownerType, ownerId, session.id)) {
      const services = await this.repository.listForOwner(ownerId, input.ownerType);
      return services.map((service) => this.toPublic(service));
    }

    const services = await this.repository.listPublicEligibleForOwner(ownerId, input.ownerType);
    return services.map((service) => this.toPublic(service));
  }

  async getOne(cookieHeader: string | undefined, id: string): Promise<PublicServiceListing> {
    const service = await this.requireService(id);
    const session = await this.identity.getSession(readSessionToken(cookieHeader));
    if (session && await this.verifyOwnership(service.ownerType, service.ownerId, session.id)) {
      return this.toPublic(service);
    }

    const publicService = await this.repository.findPublicEligibleById(id);
    if (!publicService) {
      throw new NotFoundException(SERVICE_NOT_FOUND_MESSAGE);
    }
    return this.toPublic(publicService);
  }

  async update(cookieHeader: string | undefined, id: string, request: UpdateServiceRequest): Promise<PublicServiceListing> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const service = await this.requireOwnedService(id, actor.id);
    const input = validateUpdateServiceRequest(request);
    if (input.categoryCode && input.categoryCode !== service.categoryCode) {
      await this.categories.assertActiveCategory(input.categoryCode);
    }
    const updated: ServiceListing = {
      ...service,
      titleAr: input.titleAr ?? service.titleAr,
      titleEn: input.titleEn === undefined ? service.titleEn : input.titleEn,
      descriptionAr: input.descriptionAr === undefined ? service.descriptionAr : input.descriptionAr,
      descriptionEn: input.descriptionEn === undefined ? service.descriptionEn : input.descriptionEn,
      categoryCode: input.categoryCode ?? service.categoryCode,
      price: input.price === undefined ? service.price : input.price,
      priceCurrency: input.priceCurrency === undefined ? service.priceCurrency : input.priceCurrency,
      priceType: input.priceType ?? service.priceType,
      status: input.status ?? service.status,
      updatedAt: new Date().toISOString()
    };

    await this.repository.save(updated);
    return this.toPublic(await this.repository.findById(updated.id) ?? updated);
  }

  async delete(cookieHeader: string | undefined, id: string): Promise<{ readonly status: 'ok' }> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const service = await this.requireOwnedService(id, actor.id);
    await this.repository.save({ ...service, status: 'inactive', updatedAt: new Date().toISOString() });
    return { status: 'ok' };
  }

  async search(request: SearchServicesRequest): Promise<{ readonly services: PublicServiceListing[]; readonly total: number; readonly page: number; }> {
    const input = validateServiceSearchRequest(request);
    if (input.categoryCode) await this.categories.assertActiveCategoryFilter(input.categoryCode);
    const limit = 20;
    const offset = (input.page - 1) * limit;
    const [services, total] = await Promise.all([
      this.repository.listPublicEligible({ q: input.q, categoryCode: input.categoryCode, cityCode: input.cityCode }, limit, offset),
      this.repository.countPublicEligible({ q: input.q, categoryCode: input.categoryCode, cityCode: input.cityCode })
    ]);

    return {
      services: services.map((service) => this.toPublic(service)),
      total,
      page: input.page
    };
  }

  async getFeatured(): Promise<PublicServiceListing[]> {
    const services = await this.repository.listFeatured(6);
    return services.map((s) => this.toPublic(s));
  }

  private async requireService(id: string): Promise<ServiceListing> {
    const service = await this.repository.findById(id);
    if (!service) {
      throw new NotFoundException(SERVICE_NOT_FOUND_MESSAGE);
    }
    return service;
  }

  private async requireOwnedService(id: string, actorUserId: string): Promise<ServiceListing> {
    const service = await this.requireService(id);
    if (!await this.verifyOwnership(service.ownerType, service.ownerId, actorUserId)) {
      throw new ForbiddenException(SERVICE_ACCESS_DENIED_MESSAGE);
    }
    return service;
  }

  async addMediaAsset(cookieHeader: string | undefined, serviceId: string, asset: Omit<MediaAsset, 'id' | 'createdAt'>): Promise<MediaAsset> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    await this.requireOwnedService(serviceId, actor.id);
    const full: MediaAsset = { ...asset, id: randomUUID(), createdAt: new Date().toISOString() };
    await this.businessProfiles.saveMediaAsset(full);
    return full;
  }

  async getMediaAssets(serviceId: string, assetType?: string, cookieHeader?: string): Promise<MediaAsset[]> {
    await this.getOne(cookieHeader, serviceId);
    return this.businessProfiles.listMediaAssets('service', serviceId, assetType);
  }

  private async verifyOwnership(ownerType: ServiceListing['ownerType'], ownerId: string, actorUserId: string): Promise<boolean> {
    if (ownerType === 'business') {
      const owner = await this.businessProfiles.findById(ownerId);
      return owner?.ownerUserId === actorUserId;
    }

    const owner = await this.professionalProfiles.findById(ownerId);
    return owner?.userId === actorUserId;
  }

  private toPublic(service: ServiceListing): PublicServiceListing {
    return {
      id: service.id,
      ownerType: service.ownerType,
      ownerId: service.ownerId,
      titleAr: service.titleAr,
      titleEn: service.titleEn,
      descriptionAr: service.descriptionAr,
      descriptionEn: service.descriptionEn,
      categoryCode: service.categoryCode,
      categoryNameAr: service.categoryNameAr,
      price: service.price,
      priceCurrency: service.priceCurrency,
      priceType: service.priceType,
      status: service.status,
      isFeatured: service.isFeatured,
      createdAt: service.createdAt
    };
  }
}
