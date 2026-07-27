import { BadRequestException, UnauthorizedException } from '@nestjs/common';
export declare class IdentityValidationError extends BadRequestException {
    constructor(message?: string);
}
export declare class SafeAuthenticationError extends UnauthorizedException {
    constructor();
}
