import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { OperationsProductController } from './operations-product.controller';
import { OperationsProductRepository } from './operations-product.repository';
import { OperationsRbacService } from './operations-rbac.service';
import { OperationsProductService } from './operations-product.service';
@Module({ imports: [IdentityModule], controllers: [OperationsProductController], providers: [OperationsProductRepository, OperationsRbacService, OperationsProductService], exports: [OperationsProductService, OperationsRbacService] })
export class OperationsProductModule {}
