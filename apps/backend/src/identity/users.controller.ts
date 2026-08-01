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
  async me(@Headers('cookie') cookieHeader: string | undefined): Promise<UserResponse> {
    return { user: await this.identityService.getCurrentUser(readSessionToken(cookieHeader)) };
  }

  @Patch('me/profile')
  async updateProfile(@Headers('cookie') cookieHeader: string | undefined, @Body() body: UpdateProfileRequest): Promise<UserResponse> {
    return { user: await this.identityService.updateProfile(readSessionToken(cookieHeader), body) };
  }
}
