import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IdentityModule } from '../identity/identity.module';
import { BillingAdminController, BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({imports:[DatabaseModule,IdentityModule],controllers:[BillingController,BillingAdminController],providers:[BillingService],exports:[BillingService]})
export class BillingModule{}
