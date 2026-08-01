import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { getRequestContext } from '../context/request-context';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { AddOrganizationMemberRequest, CreateOrganizationRequest, UpdateOrganizationMemberRequest, UpdateOrganizationRequest } from './dto/organization.dto';
import { OrganizationAccessError, OrganizationNotFoundError } from './organization.errors';
import { OrganizationRepository } from './organization.repository';
import { Organization, OrganizationMember, PublicOrganization, PublicOrganizationMember } from './organization.types';
import { validateAddMember, validateCreateOrganization, validateUpdateMember, validateUpdateOrganization } from './organization.validation';

@Injectable()
export class OrganizationService {
  constructor(
    @Inject(OrganizationRepository) private readonly organizations: OrganizationRepository,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(IdentityRepository) private readonly identityRepository: IdentityRepository
  ) {}

  async create(cookieHeader: string | undefined, request: CreateOrganizationRequest): Promise<PublicOrganization> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const input = validateCreateOrganization(request);
    const now = new Date().toISOString();
    const organization: Organization = {
      id: randomUUID(),
      name: input.name,
      ownerUserId: actor.id,
      createdAt: now,
      updatedAt: now
    };
    const ownerMember: OrganizationMember = {
      id: randomUUID(),
      organizationId: organization.id,
      userId: actor.id,
      role: 'owner',
      status: 'active',
      createdAt: now,
      updatedAt: now
    };

    await this.organizations.saveOrganization(organization);
    await this.organizations.saveMember(ownerMember);
    await this.audit('organization.create', actor.id);

    return this.toPublicOrganization(organization);
  }

  async listMine(cookieHeader: string | undefined): Promise<PublicOrganization[]> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const orgs = await this.organizations.listOrganizationsForUser(actor.id);
    return Promise.all(orgs.map((organization) => this.toPublicOrganization(organization)));
  }

  async getDetails(cookieHeader: string | undefined, organizationId: string): Promise<PublicOrganization> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const organization = await this.requireOrganization(organizationId);
    await this.requireActiveMember(organization.id, actor.id);

    return this.toPublicOrganization(organization);
  }

  async update(cookieHeader: string | undefined, organizationId: string, request: UpdateOrganizationRequest): Promise<PublicOrganization> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const organization = await this.requireOrganization(organizationId);
    await this.requireOwner(organization.id, actor.id);
    const input = validateUpdateOrganization(request);
    const updated: Organization = {
      ...organization,
      name: input.name,
      updatedAt: new Date().toISOString()
    };

    await this.organizations.saveOrganization(updated);
    await this.audit('organization.update', actor.id);

    return this.toPublicOrganization(updated);
  }

  async listMembers(cookieHeader: string | undefined, organizationId: string): Promise<PublicOrganizationMember[]> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const organization = await this.requireOrganization(organizationId);
    await this.requireActiveMember(organization.id, actor.id);
    const members = await this.organizations.listMembers(organization.id);

    return members.map((member) => this.toPublicMember(member));
  }

  async addMember(cookieHeader: string | undefined, organizationId: string, request: AddOrganizationMemberRequest): Promise<PublicOrganizationMember> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const organization = await this.requireOrganization(organizationId);
    await this.requireOwner(organization.id, actor.id);
    const input = validateAddMember(request);
    if (!await this.identityRepository.findAccountById(input.userId)) {
      throw new OrganizationAccessError();
    }

    const existing = await this.organizations.findMemberByOrganizationAndUser(organization.id, input.userId);
    const now = new Date().toISOString();
    const member: OrganizationMember = existing
      ? { ...existing, role: input.role, status: 'active', updatedAt: now }
      : {
          id: randomUUID(),
          organizationId: organization.id,
          userId: input.userId,
          role: input.role,
          status: 'active',
          createdAt: now,
          updatedAt: now
        };

    await this.organizations.saveMember(member);
    await this.audit('organization.member.add', actor.id);

    return this.toPublicMember(member);
  }

  async updateMember(cookieHeader: string | undefined, organizationId: string, memberId: string, request: UpdateOrganizationMemberRequest): Promise<PublicOrganizationMember> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const organization = await this.requireOrganization(organizationId);
    await this.requireOwner(organization.id, actor.id);
    const member = await this.requireMember(memberId, organization.id);
    const input = validateUpdateMember(request);
    const updated: OrganizationMember = {
      ...member,
      role: input.role ?? member.role,
      status: input.status ?? member.status,
      updatedAt: new Date().toISOString()
    };

    if (member.userId === organization.ownerUserId && updated.status === 'removed') {
      throw new OrganizationAccessError();
    }

    await this.organizations.saveMember(updated);
    await this.audit('organization.member.update', actor.id);

    return this.toPublicMember(updated);
  }

  async removeMember(cookieHeader: string | undefined, organizationId: string, memberId: string): Promise<{ readonly status: 'ok' }> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const organization = await this.requireOrganization(organizationId);
    await this.requireOwner(organization.id, actor.id);
    const member = await this.requireMember(memberId, organization.id);
    if (member.userId === organization.ownerUserId) {
      throw new OrganizationAccessError();
    }

    await this.organizations.saveMember({ ...member, status: 'removed', updatedAt: new Date().toISOString() });
    await this.audit('organization.member.remove', actor.id);

    return { status: 'ok' };
  }

  private async requireOrganization(id: string): Promise<Organization> {
    const organization = await this.organizations.findOrganization(id);
    if (!organization) {
      throw new OrganizationNotFoundError();
    }

    return organization;
  }

  private async requireActiveMember(organizationId: string, userId: string): Promise<OrganizationMember> {
    const member = await this.organizations.findMemberByOrganizationAndUser(organizationId, userId);
    if (!member || member.status !== 'active') {
      throw new OrganizationAccessError();
    }

    return member;
  }

  private async requireOwner(organizationId: string, userId: string): Promise<OrganizationMember> {
    const member = await this.requireActiveMember(organizationId, userId);
    if (member.role !== 'owner') {
      throw new OrganizationAccessError();
    }

    return member;
  }

  private async requireMember(memberId: string, organizationId: string): Promise<OrganizationMember> {
    const member = await this.organizations.findMember(memberId);
    if (!member || member.organizationId !== organizationId) {
      throw new OrganizationNotFoundError();
    }

    return member;
  }

  private async toPublicOrganization(organization: Organization): Promise<PublicOrganization> {
    return {
      id: organization.id,
      name: organization.name,
      ownerUserId: organization.ownerUserId,
      memberCount: await this.organizations.countActiveMembers(organization.id)
    };
  }

  private toPublicMember(member: OrganizationMember): PublicOrganizationMember {
    return {
      id: member.id,
      organizationId: member.organizationId,
      userId: member.userId,
      role: member.role,
      status: member.status
    };
  }

  private audit(eventType: Parameters<IdentityRepository['appendAuditLog']>[0], actorUserId: string): Promise<void> {
    const requestContext = getRequestContext();
    return this.identityRepository.appendAuditLog(eventType, {
      actorUserId,
      requestId: requestContext?.requestId,
      correlationId: requestContext?.correlationId
    });
  }
}
