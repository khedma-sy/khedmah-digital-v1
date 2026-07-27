"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactRepository = void 0;
const common_1 = require("@nestjs/common");
let ContactRepository = class ContactRepository {
    businessProfiles = new Map();
    contactInquiries = new Map();
    contactActions = new Map();
    saveBusinessProfileSnapshot(profile) {
        this.businessProfiles.set(profile.id, profile);
    }
    findBusinessProfileSnapshot(id) {
        return this.businessProfiles.get(id);
    }
    saveContactInquiry(inquiry) {
        this.contactInquiries.set(inquiry.id, inquiry);
    }
    findContactInquiry(id) {
        return this.contactInquiries.get(id);
    }
    listContactInquiries() {
        return [...this.contactInquiries.values()];
    }
    saveContactAction(event) {
        this.contactActions.set(event.id, event);
    }
    listContactActions() {
        return [...this.contactActions.values()];
    }
};
exports.ContactRepository = ContactRepository;
exports.ContactRepository = ContactRepository = __decorate([
    (0, common_1.Injectable)()
], ContactRepository);
//# sourceMappingURL=contact.repository.js.map