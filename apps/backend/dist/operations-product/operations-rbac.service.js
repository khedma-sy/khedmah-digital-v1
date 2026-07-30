"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperationsRbacService = void 0;
const common_1 = require("@nestjs/common");
const operations_product_types_1 = require("./operations-product.types");
let OperationsRbacService = class OperationsRbacService {
    rolesFor(email) {
        const raw = process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
        if (!raw)
            return [];
        let bindings;
        try {
            bindings = JSON.parse(raw);
        }
        catch {
            throw new Error('OPERATIONS_PRODUCT_ROLE_BINDINGS must be valid JSON');
        }
        if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings))
            throw new Error('OPERATIONS_PRODUCT_ROLE_BINDINGS must be an object');
        const roles = bindings[email.toLowerCase()];
        if (!Array.isArray(roles) || roles.some(role => !operations_product_types_1.OPERATIONS_PRODUCT_ROLES.includes(role)))
            return [];
        return roles;
    }
    assert(email, permission) {
        const roles = this.rolesFor(email);
        if (!roles.some(role => operations_product_types_1.ROLE_PERMISSIONS[role].includes(permission)))
            throw new common_1.ForbiddenException('Operations Product access denied.');
        return roles;
    }
};
exports.OperationsRbacService = OperationsRbacService;
exports.OperationsRbacService = OperationsRbacService = __decorate([
    (0, common_1.Injectable)()
], OperationsRbacService);
//# sourceMappingURL=operations-rbac.service.js.map