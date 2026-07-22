import { IdentityValidationError } from './identity.errors';
import { LoginRequest, RegisterRequest, UpdateProfileRequest } from './dto/auth.dto';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new IdentityValidationError();
  }

  const email = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new IdentityValidationError();
  }

  return email;
}

export function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw new IdentityValidationError();
  }

  return value;
}

export function validateDisplayName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new IdentityValidationError();
  }

  const displayName = value.trim();
  if (displayName.length < 2 || displayName.length > 80) {
    throw new IdentityValidationError();
  }

  return displayName;
}

export function validateRegisterRequest(request: RegisterRequest) {
  return {
    email: normalizeEmail(request.email),
    password: validatePassword(request.password),
    displayName: validateDisplayName(request.displayName)
  };
}

export function validateLoginRequest(request: LoginRequest) {
  return {
    email: normalizeEmail(request.email),
    password: validatePassword(request.password)
  };
}

export function validateUpdateProfileRequest(request: UpdateProfileRequest) {
  return {
    displayName: validateDisplayName(request.displayName)
  };
}
