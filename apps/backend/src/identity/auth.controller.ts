import { Body, Controller, Get, Headers, Inject, Post, Res, UnauthorizedException } from "@nestjs/common";
import type { Response } from "express";
import { ForgotPasswordRequest, GoogleLoginRequest, LoginRequest, RegisterRequest, ResetPasswordRequest } from "./dto/auth.dto";
import { IdentityService } from "./identity.service";
import { PublicUserProfile } from "./identity.types";
import { attachSessionCookie, clearSessionCookie, readSessionToken } from "./session-cookie";
import { EmailVerificationService } from './email/email-verification.service';
import { PasswordRecoveryService } from './password/password-recovery.service';
import { GoogleLoginService } from './oauth/google-login.service';

interface AuthResponse {
  readonly user: PublicUserProfile;
}

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(IdentityService) private readonly identityService: IdentityService,
    @Inject(EmailVerificationService) private readonly emailVerification: EmailVerificationService,
    @Inject(PasswordRecoveryService) private readonly passwordRecovery: PasswordRecoveryService,
    @Inject(GoogleLoginService) private readonly googleLogin: GoogleLoginService
  ) {}

  @Post("register")
  async register(@Body() body: RegisterRequest): Promise<AuthResponse & { verificationRequired: true }> {
    const result = await this.identityService.register(body);
    await this.emailVerification.requestVerification(result.user.id, result.user.email);
    return { user: result.user, verificationRequired: true };
  }

  @Post("login")
  async login(@Body() body: LoginRequest, @Res({ passthrough: true }) response: Response): Promise<AuthResponse> {
    const result = await this.identityService.login(body);
    attachSessionCookie(response, result.sessionToken);
    return { user: result.user };
  }

  @Post("google")
  async google(@Body() body: GoogleLoginRequest, @Res({ passthrough: true }) response: Response): Promise<AuthResponse> {
    const result = await this.googleLogin.login(body.idToken);
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
  async forgotPassword(@Body() body: ForgotPasswordRequest) {
    return this.passwordRecovery.requestReset(body.email);
  }

  @Post("reset-password")
  async resetPassword(@Body() body: ResetPasswordRequest) {
    return this.passwordRecovery.resetPassword(body.token, body.newPassword);
  }
}
