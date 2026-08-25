import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';

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

export class EmailVerificationRequiredError extends ForbiddenException {
  constructor() {
    super({
      statusCode: 403,
      error: 'Forbidden',
      code: 'EMAIL_VERIFICATION_REQUIRED',
      message: 'يجب تأكيد البريد الإلكتروني قبل تسجيل الدخول.'
    });
  }
}
