import { Body, Controller, Get, Headers, Inject, Patch } from '@nestjs/common';
import { UpdateProfileRequest } from './dto/auth.dto';
import { IdentityService } from './identity.service';
import { PublicUserProfile } from './identity.types';
import { readSessionToken } from './session-cookie';

interface UserResponse {
  readonly user: PublicUserProfile;
}

@Controller('users')
export class UsersController {
  constructor(@Inject(IdentityService) private readonly identityService: IdentityService) {}

  @Get('me')
  me(@Headers('cookie') cookieHeader: string | undefined): UserResponse {
    return { user: this.identityService.getCurrentUser(readSessionToken(cookieHeader)) };
  }

  @Patch('me/profile')
  updateProfile(@Headers('cookie') cookieHeader: string | undefined, @Body() body: UpdateProfileRequest): UserResponse {
    return { user: this.identityService.updateProfile(readSessionToken(cookieHeader), body) };
  }
}
