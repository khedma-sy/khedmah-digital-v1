export type CategoryStatus = 'active' | 'inactive';

export interface Category {
  readonly code: string;
  readonly nameAr: string;
  readonly nameEn?: string;
  readonly status: CategoryStatus;
  readonly sortOrder: number;
}
