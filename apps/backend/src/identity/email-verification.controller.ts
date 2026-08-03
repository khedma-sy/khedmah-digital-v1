import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { readSessionToken } from './session-cookie';
import { EmailVerificationService } from './email-verification.service';
import { IdentityService } from './identity.service';

@Controller('auth/email-verification')
export class EmailVerificationController {
  constructor(
    @Inject(EmailVerificationService) private readonly emailVerification: EmailVerificationService,
    @Inject(IdentityService) private readonly identity: IdentityService
  ) {}

  /**
   * POST /auth/email-verification/send
   * Send (or resend) a verification email for the authenticated user.
   */
  @Post('send')
  @HttpCode(HttpStatus.OK)
  async send(@Req() req: Request): Promise<{ status: string }> {
    const sessionToken = readSessionToken(req.headers.cookie);
    const user = await this.identity.getCurrentUser(sessionToken);
    const result = await this.emailVerification.sendVerification(user.id, user.email);
    return { status: result.status };
  }

  /**
   * GET /auth/email-verification/verify?token=...
   * Verify the token sent to the user's email address.
   */
  @Get('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Query('token') token: string): Promise<{ status: string }> {
    const result = await this.emailVerification.verifyToken(token ?? '');
    return { status: result.status };
  }
}
