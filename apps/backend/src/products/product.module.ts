import { Module } from '@nestjs/common';
import { BusinessProfilesModule } from '../business-profiles/business-profiles.module';
import { CategoryModule } from '../categories/category.module';
import { IdentityModule } from '../identity/identity.module';
import { OperationsProductModule } from '../operations-product/operations-product.module';
import { AdminProductController, ProductController } from './product.controller';
import { ProductRepository } from './product.repository';
import { ProductService } from './product.service';

@Module({
  imports: [IdentityModule, BusinessProfilesModule, CategoryModule, OperationsProductModule],
  controllers: [ProductController, AdminProductController],
  providers: [ProductRepository, ProductService]
})
export class ProductModule {}
