export type OrganizationMemberRole = 'owner' | 'member';
export type OrganizationMemberStatus = 'active' | 'removed';
export interface Organization {
    readonly id: string;
    readonly name: string;
    readonly ownerUserId: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}
export interface OrganizationMember {
    readonly id: string;
    readonly organizationId: string;
    readonly userId: string;
    readonly role: OrganizationMemberRole;
    readonly status: OrganizationMemberStatus;
    readonly createdAt: string;
    readonly updatedAt: string;
}
export interface PublicOrganization {
    readonly id: string;
    readonly name: string;
    readonly ownerUserId: string;
    readonly memberCount: number;
}
export interface PublicOrganizationMember {
    readonly id: string;
    readonly organizationId: string;
    readonly userId: string;
    readonly role: OrganizationMemberRole;
    readonly status: OrganizationMemberStatus;
}
