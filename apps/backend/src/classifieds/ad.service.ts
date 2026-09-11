import { createHash } from 'node:crypto';
import { HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { AdRepository } from './ad.repository';
import type { AdListing, PublicAdListing } from './ad.types';
import {
  validateAdCreate,
  validateAdModeration,
  validateAdPublicFilters,
  validateAdRevisionAction,
  validateAdSubmit,
  validateAdUpdate
} from './ad.validation';

@Injectable()
export class AdService {
  constructor(
    @Inject(AdRepository) private readonly repository: AdRepository,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(OperationsRbacService) private readonly rbac: OperationsRbacService
  ) {}

  async create(cookie: string | undefined, body: unknown): Promise<AdListing> {
    this.assertEnabled();
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const request = validateAdCreate(body);
    const id = createHash('sha256').update(JSON.stringify(['ad-create-v1', actor.id, request.clientRequestId])).digest('hex');
    return this.runRepository(() => this.repository.create(actor.id, id, request.clientRequestId, fingerprint(request.input), request.input));
  }

  async update(cookie: string | undefined, id: string, body: unknown): Promise<AdListing> {
    this.assertEnabled();
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const request = validateAdUpdate(body);
    return this.runRepository(() => this.repository.update(actor.id, id, request.clientRequestId,
      fingerprint({ id, expectedContentRevision: request.expectedContentRevision, patch: request.patch }),
      request.expectedContentRevision, request.patch));
  }

  async submit(cookie: string | undefined, id: string, body: unknown): Promise<AdListing> {
    this.assertEnabled();
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const request = validateAdSubmit(body);
    return this.runRepository(() => this.repository.submit(actor.id, id, request.clientRequestId, fingerprint({ id })));
  }

  async deactivate(cookie: string | undefined, id: string, body: unknown): Promise<AdListing> {
    this.assertEnabled();
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const request = validateAdRevisionAction(body);
    return this.runRepository(() => this.repository.deactivate(actor.id, id, request.clientRequestId,
      fingerprint({ id, expectedRevision: request.expectedRevision }), request.expectedRevision));
  }

  async reactivate(cookie: string | undefined, id: string, body: unknown): Promise<AdListing> {
    this.assertEnabled();
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const request = validateAdRevisionAction(body);
    return this.runRepository(() => this.repository.reactivate(actor.id, id, request.clientRequestId,
      fingerprint({ id, expectedRevision: request.expectedRevision }), request.expectedRevision));
  }

  async listMine(cookie: string | undefined): Promise<AdListing[]> {
    this.assertEnabled();
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    return this.runRepository(() => this.repository.listMine(actor.id));
  }

  async getMine(cookie: string | undefined, id: string): Promise<AdListing> {
    this.assertEnabled();
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const ad = await this.runRepository(() => this.repository.findMine(actor.id, id));
    if (!ad) throw new NotFoundException('Ad was not found.');
    return ad;
  }

  async quota(cookie: string | undefined): Promise<{ used: number; limit: 3 }> {
    this.assertEnabled();
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    return this.runRepository(() => this.repository.quota(actor.id));
  }

  async listPublic(filters: { q?: unknown; categoryCode?: unknown; cityCode?: unknown }): Promise<PublicAdListing[]> {
    this.assertEnabled();
    return (await this.runRepository(() => this.repository.listPublic(validateAdPublicFilters(filters)))).map(toPublicAd);
  }

  async getPublic(id: string): Promise<PublicAdListing> {
    this.assertEnabled();
    const ad = await this.runRepository(() => this.repository.findPublicById(id));
    if (!ad) throw new NotFoundException('Ad was not found.');
    return toPublicAd(ad);
  }

  async listPending(cookie: string | undefined): Promise<AdListing[]> {
    this.assertEnabled();
    await this.authorizeReviewer(cookie);
    return this.runRepository(() => this.repository.listPending());
  }

  async moderate(cookie: string | undefined, id: string, body: unknown): Promise<AdListing> {
    this.assertEnabled();
    const actor = await this.authorizeReviewer(cookie);
    const request = validateAdModeration(body);
    return this.runRepository(() => this.repository.moderate(actor.id, id, request.expectedReviewRevision, request.decision, request.reason));
  }

  private assertEnabled(): void {
    if (process.env.CLASSIFIEDS_ENABLED !== 'true') throw new ServiceUnavailableException('Classifieds are not enabled.');
  }

  private async authorizeReviewer(cookie: string | undefined) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    this.rbac.assert(actor.email, 'security.manage');
    return actor;
  }

  private async runRepository<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) { this.rethrowRepositoryError(error); }
  }

  private rethrowRepositoryError(error: unknown): never {
    if (error instanceof HttpException) throw error;
    const pg = error as { code?: string; message?: string; detail?: string };
    if (pg.code === '23514' && `${pg.message ?? ''} ${pg.detail ?? ''}`.includes('AD_FREE_QUOTA_EXHAUSTED')) {
      throw new HttpException({ code: 'AD_FREE_QUOTA_EXHAUSTED', message: 'تم استهلاك الحصة المجانية الحالية للإعلانات.' }, 429);
    }
    if (['3F000', '42P01', '42703', '42883', '42501', '40P01', '40001', '55P03', '57014'].includes(pg.code ?? '')) {
      throw new ServiceUnavailableException('Classifieds storage is temporarily unavailable.');
    }
    throw error;
  }
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function toPublicAd(ad: AdListing): PublicAdListing {
  const {
    ownerUserId: _ownerUserId,
    rejectionReason: _rejectionReason,
    revision: _revision,
    contentRevision: _contentRevision,
    reviewRevision: _reviewRevision,
    ...publicAd
  } = ad;
  return publicAd;
}
