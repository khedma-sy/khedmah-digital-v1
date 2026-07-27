import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
export declare class OrganizationValidationError extends BadRequestException {
    constructor();
}
export declare class OrganizationAccessError extends ForbiddenException {
    constructor();
}
export declare class OrganizationNotFoundError extends NotFoundException {
    constructor();
}
