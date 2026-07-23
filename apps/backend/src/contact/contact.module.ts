import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PlatformLogger } from '../logging/platform-logger';
import { ContactAbuseService } from './contact-abuse.service';
import { ContactController } from './contact.controller';
import { ContactRateLimitService } from './contact-rate-limit.service';
import { ContactRepository } from './contact.repository';
import { ContactService } from './contact.service';

@Module({
  imports: [IdentityModule],
  controllers: [ContactController],
  providers: [ContactRepository, ContactService, ContactRateLimitService, ContactAbuseService, PlatformLogger],
  exports: [ContactRepository, ContactService, ContactRateLimitService]
})
export class ContactModule {}
