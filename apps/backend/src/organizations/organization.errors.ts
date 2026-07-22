import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

export class OrganizationValidationError extends BadRequestException {
  constructor() {
    super('Organization request validation failed.');
  }
}

export class OrganizationAccessError extends ForbiddenException {
  constructor() {
    super('Organization access denied.');
  }
}

export class OrganizationNotFoundError extends NotFoundException {
  constructor() {
    super('Organization was not found.');
  }
}
