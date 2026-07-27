import { LoginRequest, RegisterRequest, UpdateProfileRequest } from './dto/auth.dto';
import { IdentityRepository } from './identity.repository';
import { PublicUserProfile } from './identity.types';
import { SessionTokenService } from './security/session-token.service';
export interface AuthResult {
    readonly sessionToken: string;
    readonly user: PublicUserProfile;
}
export declare class IdentityService {
    private readonly repository;
    private readonly sessionTokens;
    constructor(repository: IdentityRepository, sessionTokens: SessionTokenService);
    register(request: RegisterRequest): AuthResult;
    login(request: LoginRequest): AuthResult;
    logout(sessionToken: string | undefined): void;
    getSession(sessionToken: string | undefined): PublicUserProfile | undefined;
    getCurrentUser(sessionToken: string | undefined): PublicUserProfile;
    updateProfile(sessionToken: string | undefined, request: UpdateProfileRequest): PublicUserProfile;
    private createSession;
    private findSession;
    private toPublicProfile;
    private audit;
}
