import { Organization, OrganizationMember } from './organization.types';
export declare class OrganizationRepository {
    private readonly organizations;
    private readonly members;
    saveOrganization(organization: Organization): void;
    findOrganization(id: string): Organization | undefined;
    listOrganizationsForUser(userId: string): Organization[];
    saveMember(member: OrganizationMember): void;
    findMember(id: string): OrganizationMember | undefined;
    findMemberByOrganizationAndUser(organizationId: string, userId: string): OrganizationMember | undefined;
    listMembers(organizationId: string): OrganizationMember[];
    countActiveMembers(organizationId: string): number;
}
