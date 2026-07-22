export interface RegisterRequest {
  readonly email?: unknown;
  readonly password?: unknown;
  readonly displayName?: unknown;
}

export interface LoginRequest {
  readonly email?: unknown;
  readonly password?: unknown;
}

export interface UpdateProfileRequest {
  readonly displayName?: unknown;
}
