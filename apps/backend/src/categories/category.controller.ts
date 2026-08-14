import { Controller, Get, Inject, Param } from '@nestjs/common';
import { CategoryService } from './category.service';

@Controller('categories')
export class CategoryController {
  constructor(@Inject(CategoryService) private readonly categories: CategoryService) {}

  @Get()
  async list() { return { categories: await this.categories.listActive() }; }

  @Get(':code')
  async get(@Param('code') code: string) { return { category: await this.categories.getActive(code) }; }
}
