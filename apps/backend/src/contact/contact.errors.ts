import { BadRequestException, ForbiddenException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';

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

export class ContactRateLimitError extends HttpException {
  constructor() {
    super('Contact rate limit exceeded.', HttpStatus.TOO_MANY_REQUESTS);
  }
}

export class ContactIdempotencyConflictError extends HttpException {
  constructor() {
    super('Idempotency key was already used for a different contact request.', HttpStatus.CONFLICT);
  }
}
