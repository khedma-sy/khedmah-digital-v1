import { Body, Controller, Get, Headers, Inject, Post, Res, UnauthorizedException } from "@nestjs/common";
import type { Response } from "express";
import { FacebookLoginRequest, ForgotPasswordRequest, GoogleLoginRequest, LoginRequest, RegisterRequest, ResetPasswordRequest } from "./dto/auth.dto";
import { EmailVerificationService } from "./email/email-verification.service";
import { GoogleAuthService } from "./google-auth.service";
import { IdentityService } from "./identity.service";
import { PasswordRecoveryService } from "./password-recovery.service";
import { PublicUserProfile } from "./identity.types";
import { attachSessionCookie, clearSessionCookie, readSessionToken } from "./session-cookie";

interface AuthResponse {
  readonly user: PublicUserProfile;
}

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(IdentityService) private readonly identityService: IdentityService,
    @Inject(EmailVerificationService) private readonly emailVerification: EmailVerificationService,
    @Inject(PasswordRecoveryService) private readonly passwordRecovery: PasswordRecoveryService,
    @Inject(GoogleAuthService) private readonly googleAuth: GoogleAuthService
  ) {}

  @Post("register")
  async register(@Body() body: RegisterRequest): Promise<{ user: PublicUserProfile; verificationRequired: true }> {
    const result = await this.identityService.register(body);
    await this.emailVerification.requestVerification(result.user.id, result.user.email);
    return result;
  }

  @Post("login")
  async login(@Body() body: LoginRequest, @Res({ passthrough: true }) response: Response): Promise<AuthResponse> {
    const result = await this.identityService.login(body);
    attachSessionCookie(response, result.sessionToken);
    return { user: result.user };
  }

  @Post("google")
  async google(@Body() body: GoogleLoginRequest, @Res({ passthrough: true }) response: Response): Promise<AuthResponse> {
    const result = await this.googleAuth.signIn(body.idToken, "google");
    attachSessionCookie(response, result.sessionToken);
    return { user: result.user };
  }

  @Post("facebook")
  async facebook(@Body() body: FacebookLoginRequest, @Res({ passthrough: true }) response: Response): Promise<AuthResponse> {
    const result = await this.googleAuth.signIn(body.idToken, "facebook");
    attachSessionCookie(response, result.sessionToken);
    return { user: result.user };
  }

  @Post("logout")
  async logout(@Headers("cookie") cookieHeader: string | undefined, @Res({ passthrough: true }) response: Response) {
    try {
      await this.identityService.logout(readSessionToken(cookieHeader));
    } finally {
      // The browser session must end even when remote revocation or audit storage
      // is temporarily unavailable. Server-side revocation remains best-effort
      // and the short-lived session still expires independently.
      clearSessionCookie(response);
    }
    return { status: "ok" as const };
  }

  @Get("session")
  async session(@Headers("cookie") cookieHeader: string | undefined): Promise<AuthResponse> {
    const user = await this.identityService.getSession(readSessionToken(cookieHeader));
    if (!user) throw new UnauthorizedException("Authentication required.");
    return { user };
  }

  @Post("forgot-password")
  async forgotPassword(@Body() body: ForgotPasswordRequest) {
    await this.passwordRecovery.requestReset(body.email);
    return { message: "If the email exists, a password reset link has been sent." };
  }

  @Post("reset-password")
  async resetPassword(@Body() body: ResetPasswordRequest) {
    await this.passwordRecovery.resetPassword(body.token, body.newPassword);
    return { message: "Password reset successful." };
  }
}
