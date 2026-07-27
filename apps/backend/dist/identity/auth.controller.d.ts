import type { Response } from 'express';
import { LoginRequest, RegisterRequest } from './dto/auth.dto';
import { IdentityService } from './identity.service';
import { PublicUserProfile } from './identity.types';
interface AuthResponse {
    readonly user: PublicUserProfile;
}
export declare class AuthController {
    private readonly identityService;
    constructor(identityService: IdentityService);
    register(body: RegisterRequest, response: Response): AuthResponse;
    login(body: LoginRequest, response: Response): AuthResponse;
    logout(cookieHeader: string | undefined, response: Response): {
        status: "ok";
    };
    session(cookieHeader: string | undefined): AuthResponse;
}
export {};
