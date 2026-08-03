import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { BootstrapAdminController } from './bootstrap-admin.controller';
import { BootstrapAdminService } from './bootstrap-admin.service';
import { EmailVerificationController } from './email-verification.controller';
import { EmailVerificationService } from './email-verification.service';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';
import { SessionTokenService } from './security/session-token.service';
import { UsersController } from './users.controller';

@Module({
  controllers: [AuthController, UsersController, BootstrapAdminController, EmailVerificationController],
  providers: [IdentityRepository, IdentityService, SessionTokenService, BootstrapAdminService, EmailVerificationService],
  exports: [IdentityService, IdentityRepository, BootstrapAdminService, EmailVerificationService]
})
export class IdentityModule {}
