import { Body, Controller, Get, Headers, Inject, Post, Res, UnauthorizedException } from "@nestjs/common";
import type { Response } from "express";
import { ForgotPasswordRequest, LoginRequest, RegisterRequest, ResetPasswordRequest } from "./dto/auth.dto";
import { IdentityService } from "./identity.service";
import { PublicUserProfile } from "./identity.types";
import { attachSessionCookie, clearSessionCookie, readSessionToken } from "./session-cookie";

interface AuthResponse {
  readonly user: PublicUserProfile;
}

@Controller("auth")
export class AuthController {
  constructor(@Inject(IdentityService) private readonly identityService: IdentityService) {}

  @Post("register")
  async register(@Body() body: RegisterRequest, @Res({ passthrough: true }) response: Response): Promise<AuthResponse> {
    const result = await this.identityService.register(body);
    attachSessionCookie(response, result.sessionToken);
    return { user: result.user };
  }

  @Post("login")
  async login(@Body() body: LoginRequest, @Res({ passthrough: true }) response: Response): Promise<AuthResponse> {
    const result = await this.identityService.login(body);
    attachSessionCookie(response, result.sessionToken);
    return { user: result.user };
  }

  @Post("logout")
  async logout(@Headers("cookie") cookieHeader: string | undefined, @Res({ passthrough: true }) response: Response) {
    await this.identityService.logout(readSessionToken(cookieHeader));
    clearSessionCookie(response);
    return { status: "ok" as const };
  }

  @Get("session")
  async session(@Headers("cookie") cookieHeader: string | undefined): Promise<AuthResponse> {
    const user = await this.identityService.getSession(readSessionToken(cookieHeader));
    if (!user) {
      throw new UnauthorizedException("Authentication required.");
    }
    return { user };
  }

  @Post("forgot-password")
  async forgotPassword(@Body() _body: ForgotPasswordRequest) {
    return { message: "If the email exists, a password reset link has been sent." };
  }

  @Post("reset-password")
  async resetPassword(@Body() _body: ResetPasswordRequest) {
    return { message: "Password reset successful." };
  }
}
