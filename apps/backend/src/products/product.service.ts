import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BusinessProfileRepository } from '../business-profiles/business-profile.repository';
import { CategoryService } from '../categories/category.service';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { ProductRepository } from './product.repository';
import type { ProductListing } from './product.types';
import { validateProductWrite } from './product.validation';

@Injectable()
export class ProductService {
  constructor(
    @Inject(ProductRepository) private readonly repository: ProductRepository,
    @Inject(BusinessProfileRepository) private readonly businesses: BusinessProfileRepository,
    @Inject(CategoryService) private readonly categories: CategoryService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(OperationsRbacService) private readonly rbac: OperationsRbacService
  ) {}

  async create(cookie: string | undefined, request: Record<string, unknown>) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const input = validateProductWrite(request);
    const business = await this.businesses.findById(input.businessProfileId!);
    if (!business) throw new NotFoundException('Business profile was not found.');
    if (business.ownerUserId !== actor.id) throw new ForbiddenException('Access denied.');
    await this.categories.assertActiveCategory(input.categoryCode!);
    const now = new Date().toISOString();
    const product: ProductListing = { id: randomUUID(), businessProfileId: business.id, ownerUserId: actor.id, titleAr: input.titleAr!,
      descriptionAr: input.descriptionAr, price: input.price!, currency: input.currency!, categoryCode: input.categoryCode!,
      availability: input.availability!, status: 'draft', moderationStatus: 'pending', createdAt: now, updatedAt: now };
    await this.repository.insert(product);
    return product;
  }

  async listMine(cookie: string | undefined) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    return this.repository.listMine(actor.id);
  }

  listPublic(filters: { q?: string; categoryCode?: string; cityCode?: string }) { return this.repository.listPublic(filters); }

  async getPublic(id: string) {
    const product = await this.repository.findPublicById(id);
    if (!product) throw new NotFoundException('Product was not found.');
    return product;
  }

  async update(cookie: string | undefined, id: string, request: Record<string, unknown>) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const product = await this.requireOwner(actor.id, id);
    const input = validateProductWrite(request, true);
    if (input.categoryCode) await this.categories.assertActiveCategory(input.categoryCode);
    const updated: ProductListing = { ...product, titleAr: input.titleAr ?? product.titleAr,
      descriptionAr: input.descriptionAr === undefined ? product.descriptionAr : input.descriptionAr,
      price: input.price ?? product.price, currency: input.currency ?? product.currency, categoryCode: input.categoryCode ?? product.categoryCode,
      availability: input.availability ?? product.availability, status: 'draft', moderationStatus: 'pending', rejectionReason: undefined, updatedAt: new Date().toISOString() };
    await this.repository.update(updated); return updated;
  }

  async submit(cookie: string | undefined, id: string) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const product = await this.requireOwner(actor.id, id);
    if (!await this.repository.hasPublicImage(id)) throw new BadRequestException('Add a product image before submitting it for review.');
    const updated: ProductListing = { ...product, status: 'active', moderationStatus: 'pending', rejectionReason: undefined, updatedAt: new Date().toISOString() };
    await this.repository.update(updated); return updated;
  }

  async listPending(cookie: string | undefined) { await this.authorizeAdmin(cookie); return this.repository.listPending(); }

  async review(cookie: string | undefined, id: string, status: 'approved' | 'rejected', reason?: string) {
    await this.authorizeAdmin(cookie);
    if (status !== 'approved' && status !== 'rejected') throw new BadRequestException('Moderation status is invalid.');
    const product = await this.repository.findById(id);
    if (!product) throw new NotFoundException('Product was not found.');
    if (product.status !== 'active' || product.moderationStatus !== 'pending') throw new BadRequestException('Product is not awaiting moderation.');
    if (!await this.repository.hasPublicImage(id)) throw new BadRequestException('Product image is required.');
    if (status === 'approved') {
      const business = await this.businesses.findById(product.businessProfileId);
      if (!business || business.visibility !== 'public' || business.moderationStatus !== 'approved' || business.trustStatus !== 'approved' || business.status !== 'active') {
        throw new BadRequestException('Seller business must be public, approved, trusted, and active before product publication.');
      }
    }
    if (status === 'rejected' && (!reason || reason.trim().length < 5)) throw new BadRequestException('A rejection reason is required.');
    const updated: ProductListing = { ...product, moderationStatus: status, rejectionReason: status === 'rejected' ? reason!.trim() : undefined, updatedAt: new Date().toISOString() };
    await this.repository.update(updated); return updated;
  }

  private async authorizeAdmin(cookie: string | undefined) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    this.rbac.assert(actor.email, 'security.manage');
  }

  private async requireOwner(ownerUserId: string, id: string) {
    const product = await this.repository.findById(id);
    if (!product) throw new NotFoundException('Product was not found.');
    if (product.ownerUserId !== ownerUserId) throw new ForbiddenException('Access denied.');
    return product;
  }
}
