import { AddOrganizationMemberRequest, CreateOrganizationRequest, UpdateOrganizationMemberRequest, UpdateOrganizationRequest } from './dto/organization.dto';
import { OrganizationValidationError } from './organization.errors';
import { OrganizationMemberRole, OrganizationMemberStatus } from './organization.types';

function validateName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new OrganizationValidationError();
  }

  const name = value.trim();
  if (name.length < 2 || name.length > 120) {
    throw new OrganizationValidationError();
  }

  return name;
}

function validateIdentifier(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 128) {
    throw new OrganizationValidationError();
  }

  return value.trim();
}

function validateRole(value: unknown): OrganizationMemberRole {
  if (value === 'owner' || value === 'member') {
    return value;
  }

  throw new OrganizationValidationError();
}

function validateStatus(value: unknown): OrganizationMemberStatus {
  if (value === 'active' || value === 'removed') {
    return value;
  }

  throw new OrganizationValidationError();
}

export function validateCreateOrganization(request: CreateOrganizationRequest) {
  return { name: validateName(request.name) };
}

export function validateUpdateOrganization(request: UpdateOrganizationRequest) {
  return { name: validateName(request.name) };
}

export function validateAddMember(request: AddOrganizationMemberRequest) {
  return {
    userId: validateIdentifier(request.userId),
    role: request.role === undefined ? 'member' as const : validateRole(request.role)
  };
}

export function validateUpdateMember(request: UpdateOrganizationMemberRequest) {
  return {
    role: request.role === undefined ? undefined : validateRole(request.role),
    status: request.status === undefined ? undefined : validateStatus(request.status)
  };
}
