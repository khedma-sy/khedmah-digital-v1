import { Body, Controller, Get, Headers, Post, Res, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { LoginRequest, RegisterRequest } from './dto/auth.dto';
import { IdentityService } from './identity.service';
import { PublicUserProfile } from './identity.types';
import { attachSessionCookie, clearSessionCookie, readSessionToken } from './session-cookie';

interface AuthResponse {
  readonly user: PublicUserProfile;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('register')
  register(@Body() body: RegisterRequest, @Res({ passthrough: true }) response: Response): AuthResponse {
    const result = this.identityService.register(body);
    attachSessionCookie(response, result.sessionToken);

    return { user: result.user };
  }

  @Post('login')
  login(@Body() body: LoginRequest, @Res({ passthrough: true }) response: Response): AuthResponse {
    const result = this.identityService.login(body);
    attachSessionCookie(response, result.sessionToken);

    return { user: result.user };
  }

  @Post('logout')
  logout(@Headers('cookie') cookieHeader: string | undefined, @Res({ passthrough: true }) response: Response) {
    this.identityService.logout(readSessionToken(cookieHeader));
    clearSessionCookie(response);

    return { status: 'ok' as const };
  }

  @Get('session')
  session(@Headers('cookie') cookieHeader: string | undefined): AuthResponse {
    const user = this.identityService.getSession(readSessionToken(cookieHeader));
    if (!user) {
      throw new UnauthorizedException('Authentication required.');
    }

    return { user };
  }
}
