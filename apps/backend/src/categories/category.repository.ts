import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { Category } from './category.types';

interface CategoryRow extends Record<string, unknown> {
  code: string; name_ar: string; name_en: string | null; parent_code: string | null;
  visual_key: string; is_featured: boolean; status: 'active' | 'inactive'; sort_order: number;
}

@Injectable()
export class CategoryRepository {
  constructor(@Inject(DatabasePool) private readonly pool: DatabasePool) {}

  async listActive(): Promise<Category[]> {
    const rows = await this.pool.query<CategoryRow>(
      `SELECT code, name_ar, name_en, parent_code, visual_key, is_featured, status, sort_order FROM categories
       WHERE status = 'active' ORDER BY sort_order, name_ar, code`
    );
    return rows.map(toCategory);
  }

  async findActiveByCode(code: string): Promise<Category | undefined> {
    const [row] = await this.pool.query<CategoryRow>(
      `SELECT code, name_ar, name_en, parent_code, visual_key, is_featured, status, sort_order FROM categories
       WHERE code = $1 AND status = 'active'`, [code]
    );
    return row ? toCategory(row) : undefined;
  }

}

function toCategory(row: CategoryRow): Category {
  return {
    code: row.code,
    nameAr: row.name_ar,
    nameEn: row.name_en ?? undefined,
    parentCode: row.parent_code ?? undefined,
    visualKey: row.visual_key,
    isFeatured: row.is_featured,
    status: row.status,
    sortOrder: row.sort_order
  };
}
