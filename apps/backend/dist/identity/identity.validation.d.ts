import { LoginRequest, RegisterRequest, UpdateProfileRequest } from './dto/auth.dto';
export declare function normalizeEmail(value: unknown): string;
export declare function validatePassword(value: unknown): string;
export declare function validateDisplayName(value: unknown): string;
export declare function validateRegisterRequest(request: RegisterRequest): {
    email: string;
    password: string;
    displayName: string;
};
export declare function validateLoginRequest(request: LoginRequest): {
    email: string;
    password: string;
};
export declare function validateUpdateProfileRequest(request: UpdateProfileRequest): {
    displayName: string;
};
