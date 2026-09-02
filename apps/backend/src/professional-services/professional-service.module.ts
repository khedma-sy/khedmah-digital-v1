import { Module } from '@nestjs/common';
import { BusinessProfilesModule } from '../business-profiles/business-profiles.module';
import { CategoryModule } from '../categories/category.module';
import { IdentityModule } from '../identity/identity.module';
import { ProfessionalServiceController } from './professional-service.controller';
import { ProfessionalServiceRepository } from './professional-service.repository';
import { ProfessionalServiceService } from './professional-service.service';
@Module({imports:[IdentityModule,BusinessProfilesModule,CategoryModule],controllers:[ProfessionalServiceController],providers:[ProfessionalServiceRepository,ProfessionalServiceService]})
export class ProfessionalServiceModule{}
