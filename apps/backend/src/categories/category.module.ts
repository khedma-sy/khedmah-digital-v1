import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { CategoryAdminController } from './category-admin.controller';
import { CategoryAdminService } from './category-admin.service';
import { CategoryController } from './category.controller';
import { CategoryRepository } from './category.repository';
import { CategoryService } from './category.service';

@Module({
  imports:[IdentityModule],
  controllers: [CategoryController,CategoryAdminController],
  providers: [CategoryRepository, CategoryService,CategoryAdminService],
  exports: [CategoryService]
})
export class CategoryModule {}
