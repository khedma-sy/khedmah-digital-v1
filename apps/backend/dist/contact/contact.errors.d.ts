import { BadRequestException, ForbiddenException, NotFoundException, TooManyRequestsException } from '@nestjs/common';
export declare class ContactValidationError extends BadRequestException {
    constructor();
}
export declare class ContactBusinessUnavailableError extends NotFoundException {
    constructor();
}
export declare class ContactAccessError extends ForbiddenException {
    constructor();
}
export declare class ContactRateLimitError extends TooManyRequestsException {
    constructor();
}
