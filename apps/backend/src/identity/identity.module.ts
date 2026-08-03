import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';
import { SessionTokenService } from './security/session-token.service';
import { UsersController } from './users.controller';
import { BootstrapAdminController } from './bootstrap/bootstrap-admin.controller';
import { BootstrapAdminService } from './bootstrap/bootstrap-admin.service';
import { EmailVerificationController } from './email/email-verification.controller';
import { EmailVerificationService } from './email/email-verification.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, UsersController, BootstrapAdminController, EmailVerificationController],
  providers: [IdentityRepository, IdentityService, SessionTokenService, BootstrapAdminService, EmailVerificationService],
  exports: [IdentityService, IdentityRepository]
})
export class IdentityModule {}
