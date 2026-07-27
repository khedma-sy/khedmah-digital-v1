"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrganizationService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const request_context_1 = require("../context/request-context");
const identity_repository_1 = require("../identity/identity.repository");
const identity_service_1 = require("../identity/identity.service");
const session_cookie_1 = require("../identity/session-cookie");
const organization_errors_1 = require("./organization.errors");
const organization_repository_1 = require("./organization.repository");
const organization_validation_1 = require("./organization.validation");
let OrganizationService = class OrganizationService {
    organizations;
    identity;
    identityRepository;
    constructor(organizations, identity, identityRepository) {
        this.organizations = organizations;
        this.identity = identity;
        this.identityRepository = identityRepository;
    }
    create(cookieHeader, request) {
        const actor = this.identity.getCurrentUser((0, session_cookie_1.readSessionToken)(cookieHeader));
        const input = (0, organization_validation_1.validateCreateOrganization)(request);
        const now = new Date().toISOString();
        const organization = {
            id: (0, node_crypto_1.randomUUID)(),
            name: input.name,
            ownerUserId: actor.id,
            createdAt: now,
            updatedAt: now
        };
        const ownerMember = {
            id: (0, node_crypto_1.randomUUID)(),
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
    listMine(cookieHeader) {
        const actor = this.identity.getCurrentUser((0, session_cookie_1.readSessionToken)(cookieHeader));
        return this.organizations.listOrganizationsForUser(actor.id).map((organization) => this.toPublicOrganization(organization));
    }
    getDetails(cookieHeader, organizationId) {
        const actor = this.identity.getCurrentUser((0, session_cookie_1.readSessionToken)(cookieHeader));
        const organization = this.requireOrganization(organizationId);
        this.requireActiveMember(organization.id, actor.id);
        return this.toPublicOrganization(organization);
    }
    update(cookieHeader, organizationId, request) {
        const actor = this.identity.getCurrentUser((0, session_cookie_1.readSessionToken)(cookieHeader));
        const organization = this.requireOrganization(organizationId);
        this.requireOwner(organization.id, actor.id);
        const input = (0, organization_validation_1.validateUpdateOrganization)(request);
        const updated = {
            ...organization,
            name: input.name,
            updatedAt: new Date().toISOString()
        };
        this.organizations.saveOrganization(updated);
        this.audit('organization.update', actor.id);
        return this.toPublicOrganization(updated);
    }
    listMembers(cookieHeader, organizationId) {
        const actor = this.identity.getCurrentUser((0, session_cookie_1.readSessionToken)(cookieHeader));
        const organization = this.requireOrganization(organizationId);
        this.requireActiveMember(organization.id, actor.id);
        return this.organizations.listMembers(organization.id).map((member) => this.toPublicMember(member));
    }
    addMember(cookieHeader, organizationId, request) {
        const actor = this.identity.getCurrentUser((0, session_cookie_1.readSessionToken)(cookieHeader));
        const organization = this.requireOrganization(organizationId);
        this.requireOwner(organization.id, actor.id);
        const input = (0, organization_validation_1.validateAddMember)(request);
        if (!this.identityRepository.findAccountById(input.userId)) {
            throw new organization_errors_1.OrganizationAccessError();
        }
        const existing = this.organizations.findMemberByOrganizationAndUser(organization.id, input.userId);
        const now = new Date().toISOString();
        const member = existing
            ? { ...existing, role: input.role, status: 'active', updatedAt: now }
            : {
                id: (0, node_crypto_1.randomUUID)(),
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
    updateMember(cookieHeader, organizationId, memberId, request) {
        const actor = this.identity.getCurrentUser((0, session_cookie_1.readSessionToken)(cookieHeader));
        const organization = this.requireOrganization(organizationId);
        this.requireOwner(organization.id, actor.id);
        const member = this.requireMember(memberId, organization.id);
        const input = (0, organization_validation_1.validateUpdateMember)(request);
        const updated = {
            ...member,
            role: input.role ?? member.role,
            status: input.status ?? member.status,
            updatedAt: new Date().toISOString()
        };
        if (member.userId === organization.ownerUserId && updated.status === 'removed') {
            throw new organization_errors_1.OrganizationAccessError();
        }
        this.organizations.saveMember(updated);
        this.audit('organization.member.update', actor.id);
        return this.toPublicMember(updated);
    }
    removeMember(cookieHeader, organizationId, memberId) {
        const actor = this.identity.getCurrentUser((0, session_cookie_1.readSessionToken)(cookieHeader));
        const organization = this.requireOrganization(organizationId);
        this.requireOwner(organization.id, actor.id);
        const member = this.requireMember(memberId, organization.id);
        if (member.userId === organization.ownerUserId) {
            throw new organization_errors_1.OrganizationAccessError();
        }
        this.organizations.saveMember({ ...member, status: 'removed', updatedAt: new Date().toISOString() });
        this.audit('organization.member.remove', actor.id);
        return { status: 'ok' };
    }
    requireOrganization(id) {
        const organization = this.organizations.findOrganization(id);
        if (!organization) {
            throw new organization_errors_1.OrganizationNotFoundError();
        }
        return organization;
    }
    requireActiveMember(organizationId, userId) {
        const member = this.organizations.findMemberByOrganizationAndUser(organizationId, userId);
        if (!member || member.status !== 'active') {
            throw new organization_errors_1.OrganizationAccessError();
        }
        return member;
    }
    requireOwner(organizationId, userId) {
        const member = this.requireActiveMember(organizationId, userId);
        if (member.role !== 'owner') {
            throw new organization_errors_1.OrganizationAccessError();
        }
        return member;
    }
    requireMember(memberId, organizationId) {
        const member = this.organizations.findMember(memberId);
        if (!member || member.organizationId !== organizationId) {
            throw new organization_errors_1.OrganizationNotFoundError();
        }
        return member;
    }
    toPublicOrganization(organization) {
        return {
            id: organization.id,
            name: organization.name,
            ownerUserId: organization.ownerUserId,
            memberCount: this.organizations.countActiveMembers(organization.id)
        };
    }
    toPublicMember(member) {
        return {
            id: member.id,
            organizationId: member.organizationId,
            userId: member.userId,
            role: member.role,
            status: member.status
        };
    }
    audit(eventType, actorUserId) {
        const requestContext = (0, request_context_1.getRequestContext)();
        this.identityRepository.appendAuditLog(eventType, {
            actorUserId,
            requestId: requestContext?.requestId,
            correlationId: requestContext?.correlationId
        });
    }
};
exports.OrganizationService = OrganizationService;
exports.OrganizationService = OrganizationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [organization_repository_1.OrganizationRepository,
        identity_service_1.IdentityService,
        identity_repository_1.IdentityRepository])
], OrganizationService);
//# sourceMappingURL=organization.service.js.map