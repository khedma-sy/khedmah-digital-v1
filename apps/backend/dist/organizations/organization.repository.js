"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrganizationRepository = void 0;
const common_1 = require("@nestjs/common");
let OrganizationRepository = class OrganizationRepository {
    organizations = new Map();
    members = new Map();
    saveOrganization(organization) {
        this.organizations.set(organization.id, organization);
    }
    findOrganization(id) {
        return this.organizations.get(id);
    }
    listOrganizationsForUser(userId) {
        const organizationIds = new Set([...this.members.values()]
            .filter((member) => member.userId === userId && member.status === 'active')
            .map((member) => member.organizationId));
        return [...this.organizations.values()].filter((organization) => organizationIds.has(organization.id));
    }
    saveMember(member) {
        this.members.set(member.id, member);
    }
    findMember(id) {
        return this.members.get(id);
    }
    findMemberByOrganizationAndUser(organizationId, userId) {
        return [...this.members.values()].find((member) => member.organizationId === organizationId && member.userId === userId);
    }
    listMembers(organizationId) {
        return [...this.members.values()].filter((member) => member.organizationId === organizationId && member.status === 'active');
    }
    countActiveMembers(organizationId) {
        return this.listMembers(organizationId).length;
    }
};
exports.OrganizationRepository = OrganizationRepository;
exports.OrganizationRepository = OrganizationRepository = __decorate([
    (0, common_1.Injectable)()
], OrganizationRepository);
//# sourceMappingURL=organization.repository.js.map