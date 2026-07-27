import { RateLimitDecision } from './contact.types';
export declare class ContactRateLimitService {
    private readonly buckets;
    check(key: string, now?: number): RateLimitDecision;
}
