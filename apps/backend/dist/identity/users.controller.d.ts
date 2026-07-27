import { UpdateProfileRequest } from './dto/auth.dto';
import { IdentityService } from './identity.service';
import { PublicUserProfile } from './identity.types';
interface UserResponse {
    readonly user: PublicUserProfile;
}
export declare class UsersController {
    private readonly identityService;
    constructor(identityService: IdentityService);
    me(cookieHeader: string | undefined): UserResponse;
    updateProfile(cookieHeader: string | undefined, body: UpdateProfileRequest): UserResponse;
}
export {};
