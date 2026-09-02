export type MediaVisibility = 'public' | 'private';
export type MediaOwnerType = 'business_profile' | 'professional_profile' | 'product_listing' | 'professional_request' | 'user';
export type MediaMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type MediaAssetType = 'logo' | 'cover' | 'gallery' | 'profile_image' | 'service_image' | 'product_image' | 'problem_image' | 'completion_image';

export interface MediaAsset {
  readonly id: string;
  readonly ownerUserId: string;
  readonly ownerType: MediaOwnerType;
  readonly ownerId: string;
  readonly filename: string;
  readonly mimeType: MediaMimeType;
  readonly sizeBytes: number;
  readonly visibility: MediaVisibility;
  readonly storageKey: string;
  readonly publicUrl?: string;
  readonly assetType?: MediaAssetType;
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UploadMediaRequest {
  readonly ownerType?: unknown;
  readonly ownerId?: unknown;
  readonly visibility?: unknown;
  readonly filename?: unknown;
  readonly mimeType?: unknown;
  readonly sizeBytes?: unknown;
  readonly content?: unknown; // base64
  readonly assetType?: unknown;
  readonly sortOrder?: unknown;
}

export interface PublicMediaAsset {
  readonly id: string;
  readonly ownerType: MediaOwnerType;
  readonly ownerId: string;
  readonly filename: string;
  readonly mimeType: MediaMimeType;
  readonly sizeBytes: number;
  readonly visibility: MediaVisibility;
  readonly publicUrl?: string;
  readonly assetType?: MediaAssetType;
  readonly sortOrder: number;
  readonly createdAt: string;
}
