import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { Category } from './category.types';

interface CategoryRow extends Record<string, unknown> {
  code: string; name_ar: string; name_en: string | null; parent_code: string | null;
  visual_key: string; is_featured: boolean; status: 'active' | 'inactive'; sort_order: number;
}

const projection = 'code, name_ar, name_en, parent_code, visual_key, is_featured, status, sort_order';

@Injectable()
export class CategoryRepository {
  constructor(@Inject(DatabasePool) private readonly pool: DatabasePool) {}

  async listActive(): Promise<Category[]> {
    const rows = await this.pool.query<CategoryRow>(`SELECT ${projection} FROM categories WHERE status = 'active' ORDER BY sort_order, name_ar, code`);
    return rows.map(toCategory);
  }

  async listAll(): Promise<Category[]> {
    const rows = await this.pool.query<CategoryRow>(`SELECT ${projection} FROM categories ORDER BY sort_order, name_ar, code`);
    return rows.map(toCategory);
  }

  async findActiveByCode(code: string): Promise<Category | undefined> {
    const [row] = await this.pool.query<CategoryRow>(`SELECT ${projection} FROM categories WHERE code = $1 AND status = 'active'`, [code]);
    return row ? toCategory(row) : undefined;
  }

  async findByCode(code: string): Promise<Category | undefined> {
    const [row] = await this.pool.query<CategoryRow>(`SELECT ${projection} FROM categories WHERE code = $1`, [code]);
    return row ? toCategory(row) : undefined;
  }

  async create(category: Category): Promise<Category> {
    const [row] = await this.pool.query<CategoryRow>(
      `INSERT INTO categories(code,name_ar,name_en,parent_code,visual_key,is_featured,status,sort_order)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${projection}`,
      [category.code,category.nameAr,category.nameEn??null,category.parentCode??null,category.visualKey,category.isFeatured,category.status,category.sortOrder]
    );
    return toCategory(row);
  }

  async save(category: Category): Promise<Category | undefined> {
    const [row] = await this.pool.query<CategoryRow>(
      `UPDATE categories SET name_ar=$2,name_en=$3,parent_code=$4,visual_key=$5,is_featured=$6,status=$7,sort_order=$8
       WHERE code=$1 RETURNING ${projection}`,
      [category.code,category.nameAr,category.nameEn??null,category.parentCode??null,category.visualKey,category.isFeatured,category.status,category.sortOrder]
    );
    return row ? toCategory(row) : undefined;
  }

  async activeChildCount(code: string): Promise<number> {
    const [row] = await this.pool.query<{count:string} & Record<string, unknown>>(`SELECT count(*)::text AS count FROM categories WHERE parent_code=$1 AND status='active'`,[code]);
    return Number(row?.count ?? 0);
  }
}

function toCategory(row: CategoryRow): Category {
  return { code:row.code,nameAr:row.name_ar,nameEn:row.name_en??undefined,parentCode:row.parent_code??undefined,visualKey:row.visual_key,isFeatured:row.is_featured,status:row.status,sortOrder:row.sort_order };
}
