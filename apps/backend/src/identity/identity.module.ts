import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';
import { SessionTokenService } from './security/session-token.service';
import { UsersController } from './users.controller';

@Module({
  controllers: [AuthController, UsersController],
  providers: [IdentityRepository, IdentityService, SessionTokenService],
  exports: [IdentityService, IdentityRepository]
})
export class IdentityModule {}
