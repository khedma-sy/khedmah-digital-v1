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

  create(cookieHeader: string | undefined, request: CreateOrganizationRequest): PublicOrganization {
    const actor = this.identity.getCurrentUser(readSessionToken(cookieHeader));
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

    this.organizations.saveOrganization(organization);
    this.organizations.saveMember(ownerMember);
    this.audit('organization.create', actor.id);

    return this.toPublicOrganization(organization);
  }

  listMine(cookieHeader: string | undefined): PublicOrganization[] {
    const actor = this.identity.getCurrentUser(readSessionToken(cookieHeader));
    return this.organizations.listOrganizationsForUser(actor.id).map((organization) => this.toPublicOrganization(organization));
  }

  getDetails(cookieHeader: string | undefined, organizationId: string): PublicOrganization {
    const actor = this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const organization = this.requireOrganization(organizationId);
    this.requireActiveMember(organization.id, actor.id);

    return this.toPublicOrganization(organization);
  }

  update(cookieHeader: string | undefined, organizationId: string, request: UpdateOrganizationRequest): PublicOrganization {
    const actor = this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const organization = this.requireOrganization(organizationId);
    this.requireOwner(organization.id, actor.id);
    const input = validateUpdateOrganization(request);
    const updated: Organization = {
      ...organization,
      name: input.name,
      updatedAt: new Date().toISOString()
    };

    this.organizations.saveOrganization(updated);
    this.audit('organization.update', actor.id);

    return this.toPublicOrganization(updated);
  }

  listMembers(cookieHeader: string | undefined, organizationId: string): PublicOrganizationMember[] {
    const actor = this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const organization = this.requireOrganization(organizationId);
    this.requireActiveMember(organization.id, actor.id);

    return this.organizations.listMembers(organization.id).map((member) => this.toPublicMember(member));
  }

  addMember(cookieHeader: string | undefined, organizationId: string, request: AddOrganizationMemberRequest): PublicOrganizationMember {
    const actor = this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const organization = this.requireOrganization(organizationId);
    this.requireOwner(organization.id, actor.id);
    const input = validateAddMember(request);
    if (!this.identityRepository.findAccountById(input.userId)) {
      throw new OrganizationAccessError();
    }

    const existing = this.organizations.findMemberByOrganizationAndUser(organization.id, input.userId);
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

    this.organizations.saveMember(member);
    this.audit('organization.member.add', actor.id);

    return this.toPublicMember(member);
  }

  updateMember(cookieHeader: string | undefined, organizationId: string, memberId: string, request: UpdateOrganizationMemberRequest): PublicOrganizationMember {
    const actor = this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const organization = this.requireOrganization(organizationId);
    this.requireOwner(organization.id, actor.id);
    const member = this.requireMember(memberId, organization.id);
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

    this.organizations.saveMember(updated);
    this.audit('organization.member.update', actor.id);

    return this.toPublicMember(updated);
  }

  removeMember(cookieHeader: string | undefined, organizationId: string, memberId: string): { readonly status: 'ok' } {
    const actor = this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const organization = this.requireOrganization(organizationId);
    this.requireOwner(organization.id, actor.id);
    const member = this.requireMember(memberId, organization.id);
    if (member.userId === organization.ownerUserId) {
      throw new OrganizationAccessError();
    }

    this.organizations.saveMember({ ...member, status: 'removed', updatedAt: new Date().toISOString() });
    this.audit('organization.member.remove', actor.id);

    return { status: 'ok' };
  }

  private requireOrganization(id: string): Organization {
    const organization = this.organizations.findOrganization(id);
    if (!organization) {
      throw new OrganizationNotFoundError();
    }

    return organization;
  }

  private requireActiveMember(organizationId: string, userId: string): OrganizationMember {
    const member = this.organizations.findMemberByOrganizationAndUser(organizationId, userId);
    if (!member || member.status !== 'active') {
      throw new OrganizationAccessError();
    }

    return member;
  }

  private requireOwner(organizationId: string, userId: string): OrganizationMember {
    const member = this.requireActiveMember(organizationId, userId);
    if (member.role !== 'owner') {
      throw new OrganizationAccessError();
    }

    return member;
  }

  private requireMember(memberId: string, organizationId: string): OrganizationMember {
    const member = this.organizations.findMember(memberId);
    if (!member || member.organizationId !== organizationId) {
      throw new OrganizationNotFoundError();
    }

    return member;
  }

  private toPublicOrganization(organization: Organization): PublicOrganization {
    return {
      id: organization.id,
      name: organization.name,
      ownerUserId: organization.ownerUserId,
      memberCount: this.organizations.countActiveMembers(organization.id)
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

  private audit(eventType: Parameters<IdentityRepository['appendAuditLog']>[0], actorUserId: string): void {
    const requestContext = getRequestContext();
    this.identityRepository.appendAuditLog(eventType, {
      actorUserId,
      requestId: requestContext?.requestId,
      correlationId: requestContext?.correlationId
    });
  }
}
