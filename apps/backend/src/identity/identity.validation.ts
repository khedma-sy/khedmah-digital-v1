import { IdentityValidationError } from './identity.errors';
import { LoginRequest, RegisterRequest, UpdateProfileRequest } from './dto/auth.dto';

function isValidEmail(email: string): boolean {
  if (email.length > 254) return false;
  const atIndex = email.indexOf('@');
  if (atIndex < 1 || atIndex !== email.lastIndexOf('@')) return false;
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (local.length > 64 || domain.length < 3) return false;
  const dotIndex = domain.lastIndexOf('.');
  if (dotIndex < 1 || dotIndex === domain.length - 1) return false;
  return !/\s/.test(email);
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new IdentityValidationError();
  }

  const email = value.trim().toLowerCase();
  if (!isValidEmail(email)) {
    throw new IdentityValidationError();
  }

  return email;
}

export function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
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
