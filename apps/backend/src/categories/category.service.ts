import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CategoryRepository } from './category.repository';
import { Category } from './category.types';
import { validateCategoryCode } from './category.validation';

@Injectable()
export class CategoryService {
  constructor(@Inject(CategoryRepository) private readonly repository: CategoryRepository) {}

  listActive(): Promise<Category[]> { return this.repository.listActive(); }

  async getActive(codeValue: unknown): Promise<Category> {
    const code = validateCategoryCode(codeValue);
    const category = await this.repository.findActiveByCode(code);
    if (!category) throw new NotFoundException('Category was not found.');
    return category;
  }

  async assertActiveCategory(codeValue: unknown): Promise<string> {
    const code = validateCategoryCode(codeValue);
    if (!await this.repository.findActiveByCode(code)) {
      throw new BadRequestException('categoryCode must identify an active canonical category.');
    }
    return code;
  }
}
