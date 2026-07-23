import { BadRequestException, ForbiddenException, NotFoundException, TooManyRequestsException } from '@nestjs/common';

export class ContactValidationError extends BadRequestException {
  constructor() {
    super('Contact request validation failed.');
  }
}

export class ContactBusinessUnavailableError extends NotFoundException {
  constructor() {
    super('Business profile is not available for contact.');
  }
}

export class ContactAccessError extends ForbiddenException {
  constructor() {
    super('Contact action is not allowed.');
  }
}

export class ContactRateLimitError extends TooManyRequestsException {
  constructor() {
    super('Contact rate limit exceeded.');
  }
}
