import { Injectable } from '@nestjs/common';
import { Organization, OrganizationMember } from './organization.types';

@Injectable()
export class OrganizationRepository {
  private readonly organizations = new Map<string, Organization>();
  private readonly members = new Map<string, OrganizationMember>();

  saveOrganization(organization: Organization): void {
    this.organizations.set(organization.id, organization);
  }

  findOrganization(id: string): Organization | undefined {
    return this.organizations.get(id);
  }

  listOrganizationsForUser(userId: string): Organization[] {
    const organizationIds = new Set(
      [...this.members.values()]
        .filter((member) => member.userId === userId && member.status === 'active')
        .map((member) => member.organizationId)
    );

    return [...this.organizations.values()].filter((organization) => organizationIds.has(organization.id));
  }

  saveMember(member: OrganizationMember): void {
    this.members.set(member.id, member);
  }

  findMember(id: string): OrganizationMember | undefined {
    return this.members.get(id);
  }

  findMemberByOrganizationAndUser(organizationId: string, userId: string): OrganizationMember | undefined {
    return [...this.members.values()].find((member) => member.organizationId === organizationId && member.userId === userId);
  }

  listMembers(organizationId: string): OrganizationMember[] {
    return [...this.members.values()].filter((member) => member.organizationId === organizationId && member.status === 'active');
  }

  countActiveMembers(organizationId: string): number {
    return this.listMembers(organizationId).length;
  }
}
