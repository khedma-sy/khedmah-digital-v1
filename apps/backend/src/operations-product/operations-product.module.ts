import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { OperationsProductController } from './operations-product.controller';
import { OperationsProductRepository } from './operations-product.repository';
import { OperationsRbacService } from './operations-rbac.service';
import { OperationsProductService } from './operations-product.service';
@Module({ imports: [IdentityModule, AnalyticsModule], controllers: [OperationsProductController], providers: [OperationsProductRepository, OperationsRbacService, OperationsProductService], exports: [OperationsProductService, OperationsRbacService] })
export class OperationsProductModule {}
