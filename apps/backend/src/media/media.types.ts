export type MediaOwnerType = 'business_profile' | 'professional_profile' | 'product_listing' | 'user';
export type MediaVisibility = 'public' | 'private';
export type MediaMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type MediaAssetType = 'logo' | 'cover' | 'gallery' | 'profile_image' | 'service_image' | 'product_image' | 'driver_photo' | 'identity_card' | 'driving_license' | 'vehicle_license';

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
  readonly ownerType: MediaOwnerType;
  readonly ownerId: string;
  readonly filename: string;
  readonly mimeType: MediaMimeType;
  readonly sizeBytes: number;
  readonly content: string;
  readonly visibility?: MediaVisibility;
  readonly assetType?: MediaAssetType;
  readonly sortOrder?: number;
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
