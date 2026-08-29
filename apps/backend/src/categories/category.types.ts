export type CategoryStatus = 'active' | 'inactive';

export interface Category {
  readonly code: string;
  readonly nameAr: string;
  readonly nameEn?: string;
  readonly parentCode?: string;
  readonly visualKey: string;
  readonly isFeatured: boolean;
  readonly status: CategoryStatus;
  readonly sortOrder: number;
}
