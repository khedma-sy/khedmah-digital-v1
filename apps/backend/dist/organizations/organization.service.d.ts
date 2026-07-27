import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { AddOrganizationMemberRequest, CreateOrganizationRequest, UpdateOrganizationMemberRequest, UpdateOrganizationRequest } from './dto/organization.dto';
import { OrganizationRepository } from './organization.repository';
import { PublicOrganization, PublicOrganizationMember } from './organization.types';
export declare class OrganizationService {
    private readonly organizations;
    private readonly identity;
    private readonly identityRepository;
    constructor(organizations: OrganizationRepository, identity: IdentityService, identityRepository: IdentityRepository);
    create(cookieHeader: string | undefined, request: CreateOrganizationRequest): PublicOrganization;
    listMine(cookieHeader: string | undefined): PublicOrganization[];
    getDetails(cookieHeader: string | undefined, organizationId: string): PublicOrganization;
    update(cookieHeader: string | undefined, organizationId: string, request: UpdateOrganizationRequest): PublicOrganization;
    listMembers(cookieHeader: string | undefined, organizationId: string): PublicOrganizationMember[];
    addMember(cookieHeader: string | undefined, organizationId: string, request: AddOrganizationMemberRequest): PublicOrganizationMember;
    updateMember(cookieHeader: string | undefined, organizationId: string, memberId: string, request: UpdateOrganizationMemberRequest): PublicOrganizationMember;
    removeMember(cookieHeader: string | undefined, organizationId: string, memberId: string): {
        readonly status: 'ok';
    };
    private requireOrganization;
    private requireActiveMember;
    private requireOwner;
    private requireMember;
    private toPublicOrganization;
    private toPublicMember;
    private audit;
}
