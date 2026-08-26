import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { OperationsProductModule } from '../operations-product/operations-product.module';
import { AdminReportController, BusinessReportController, ProfessionalReportController } from './report.controller';
import { ReportRepository } from './report.repository';
import { ReportService } from './report.service';

@Module({ imports: [IdentityModule, OperationsProductModule], controllers: [BusinessReportController, ProfessionalReportController, AdminReportController], providers: [ReportRepository, ReportService] })
export class ReportsModule {}
