import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PlatformLogger } from './logging/platform-logger';
import { IdentityModule } from './identity/identity.module';
import { OrganizationsModule } from './organizations/organizations.module';

@Module({
  imports: [IdentityModule, OrganizationsModule],
  controllers: [HealthController],
  providers: [HealthService, PlatformLogger]
})
export class AppModule {}
