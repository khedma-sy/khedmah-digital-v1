import { AddOrganizationMemberRequest, CreateOrganizationRequest, UpdateOrganizationMemberRequest, UpdateOrganizationRequest } from './dto/organization.dto';
import { OrganizationService } from './organization.service';
export declare class OrganizationsController {
    private readonly organizationService;
    constructor(organizationService: OrganizationService);
    create(cookieHeader: string | undefined, body: CreateOrganizationRequest): {
        organization: import("./organization.types").PublicOrganization;
    };
    mine(cookieHeader: string | undefined): {
        organizations: import("./organization.types").PublicOrganization[];
    };
    details(cookieHeader: string | undefined, id: string): {
        organization: import("./organization.types").PublicOrganization;
    };
    update(cookieHeader: string | undefined, id: string, body: UpdateOrganizationRequest): {
        organization: import("./organization.types").PublicOrganization;
    };
    members(cookieHeader: string | undefined, id: string): {
        members: import("./organization.types").PublicOrganizationMember[];
    };
    addMember(cookieHeader: string | undefined, id: string, body: AddOrganizationMemberRequest): {
        member: import("./organization.types").PublicOrganizationMember;
    };
    updateMember(cookieHeader: string | undefined, id: string, memberId: string, body: UpdateOrganizationMemberRequest): {
        member: import("./organization.types").PublicOrganizationMember;
    };
    removeMember(cookieHeader: string | undefined, id: string, memberId: string): {
        readonly status: "ok";
    };
}
