import { AddOrganizationMemberRequest, CreateOrganizationRequest, UpdateOrganizationMemberRequest, UpdateOrganizationRequest } from './dto/organization.dto';
import { OrganizationMemberRole, OrganizationMemberStatus } from './organization.types';
export declare function validateCreateOrganization(request: CreateOrganizationRequest): {
    name: string;
};
export declare function validateUpdateOrganization(request: UpdateOrganizationRequest): {
    name: string;
};
export declare function validateAddMember(request: AddOrganizationMemberRequest): {
    userId: string;
    role: OrganizationMemberRole;
};
export declare function validateUpdateMember(request: UpdateOrganizationMemberRequest): {
    role: OrganizationMemberRole | undefined;
    status: OrganizationMemberStatus | undefined;
};
