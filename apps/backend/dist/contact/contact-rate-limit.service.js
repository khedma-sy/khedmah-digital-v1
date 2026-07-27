"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactRateLimitService = void 0;
const common_1 = require("@nestjs/common");
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 10;
let ContactRateLimitService = class ContactRateLimitService {
    buckets = new Map();
    check(key, now = Date.now()) {
        const current = this.buckets.get(key);
        const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + DEFAULT_WINDOW_MS } : current;
        bucket.count += 1;
        this.buckets.set(key, bucket);
        return {
            allowed: bucket.count <= DEFAULT_LIMIT,
            key,
            remaining: Math.max(DEFAULT_LIMIT - bucket.count, 0)
        };
    }
};
exports.ContactRateLimitService = ContactRateLimitService;
exports.ContactRateLimitService = ContactRateLimitService = __decorate([
    (0, common_1.Injectable)()
], ContactRateLimitService);
//# sourceMappingURL=contact-rate-limit.service.js.map