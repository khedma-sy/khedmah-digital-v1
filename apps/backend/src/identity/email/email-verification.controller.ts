import { Body, Controller, Headers, Inject, Post } from '@nestjs/common';
import { readSessionToken } from '../session-cookie';
import { IdentityService } from '../identity.service';
import { EmailVerificationService } from './email-verification.service';

interface RequestVerificationBody {
  readonly email?: unknown;
}

interface ConfirmVerificationBody {
  readonly token?: unknown;
}

@Controller('auth/email-verification')
export class EmailVerificationController {
  constructor(
    @Inject(EmailVerificationService) private readonly emailVerification: EmailVerificationService,
    @Inject(IdentityService) private readonly identity: IdentityService
  ) {}

  @Post('request')
  async request(
    @Headers('cookie') cookieHeader: string | undefined,
    @Body() body: RequestVerificationBody
  ): Promise<{ message: string }> {
    const user = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const email = typeof body.email === 'string' ? body.email : user.email;
    await this.emailVerification.requestVerification(user.id, email);
    return { message: 'Verification email sent.' };
  }

  @Post('confirm')
  async confirm(@Body() body: ConfirmVerificationBody): Promise<{ message: string; email: string }> {
    if (typeof body.token !== 'string' || body.token.length === 0) {
      const { BadRequestException } = await import('@nestjs/common');
      throw new BadRequestException('token is required.');
    }
    const result = await this.emailVerification.confirmVerification(body.token);
    return { message: 'Email verified successfully.', email: result.email };
  }
}
