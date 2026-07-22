import { BadRequestException, UnauthorizedException } from '@nestjs/common';

export class IdentityValidationError extends BadRequestException {
  constructor(message = 'Identity request validation failed.') {
    super(message);
  }
}

export class SafeAuthenticationError extends UnauthorizedException {
  constructor() {
    super('Invalid credentials.');
  }
}
