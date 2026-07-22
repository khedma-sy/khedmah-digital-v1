import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { OrganizationRepository } from './organization.repository';
import { OrganizationService } from './organization.service';
import { OrganizationsController } from './organizations.controller';

@Module({
  imports: [IdentityModule],
  controllers: [OrganizationsController],
  providers: [OrganizationRepository, OrganizationService]
})
export class OrganizationsModule {}
