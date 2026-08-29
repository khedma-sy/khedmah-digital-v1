import { BadRequestException } from '@nestjs/common';
import type { MediaAssetType, MediaMimeType, MediaOwnerType, MediaVisibility, UploadMediaRequest } from './media.types';

const ALLOWED_MIME_TYPES: MediaMimeType[] = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_OWNER_TYPES: MediaOwnerType[] = ['business_profile', 'professional_profile', 'product_listing', 'user'];
const ALLOWED_VISIBILITIES: MediaVisibility[] = ['public', 'private'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_ASSET_TYPES: MediaAssetType[] = ['logo', 'cover', 'gallery', 'profile_image', 'service_image', 'product_image'];

export function validateUploadMediaRequest(req: UploadMediaRequest): {
  ownerType: MediaOwnerType;
  ownerId: string;
  visibility: MediaVisibility;
  filename: string;
  mimeType: MediaMimeType;
  sizeBytes: number;
  content: string;
  assetType?: MediaAssetType;
  sortOrder: number;
} {
  if (!ALLOWED_OWNER_TYPES.includes(req.ownerType as MediaOwnerType)) {
    throw new BadRequestException(`ownerType must be one of: ${ALLOWED_OWNER_TYPES.join(', ')}`);
  }
  if (typeof req.ownerId !== 'string' || req.ownerId.trim().length === 0) {
    throw new BadRequestException('ownerId is required.');
  }
  if (!ALLOWED_VISIBILITIES.includes(req.visibility as MediaVisibility)) {
    throw new BadRequestException(`visibility must be one of: ${ALLOWED_VISIBILITIES.join(', ')}`);
  }
  if (typeof req.filename !== 'string' || req.filename.trim().length === 0 || req.filename.length > 255) {
    throw new BadRequestException('filename is required and must be ≤255 characters.');
  }
  if (!ALLOWED_MIME_TYPES.includes(req.mimeType as MediaMimeType)) {
    throw new BadRequestException(`mimeType must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`);
  }
  if (typeof req.sizeBytes !== 'number' || req.sizeBytes <= 0 || req.sizeBytes > MAX_SIZE_BYTES) {
    throw new BadRequestException(`sizeBytes must be between 1 and ${MAX_SIZE_BYTES} bytes.`);
  }
  if (typeof req.content !== 'string' || req.content.length === 0) {
    throw new BadRequestException('content (base64) is required.');
  }
  if (req.assetType !== undefined && !ALLOWED_ASSET_TYPES.includes(req.assetType as MediaAssetType)) {
    throw new BadRequestException(`assetType must be one of: ${ALLOWED_ASSET_TYPES.join(', ')}`);
  }
  if (req.ownerType === 'business_profile' && !['logo', 'cover', 'gallery'].includes(req.assetType as string)) {
    throw new BadRequestException('Business media requires logo, cover, or gallery assetType.');
  }
  if (req.ownerType === 'product_listing' && req.assetType !== 'product_image') {
    throw new BadRequestException('Product media requires product_image assetType.');
  }
  const sortOrder = req.sortOrder === undefined ? 0 : req.sortOrder;
  if (!Number.isInteger(sortOrder) || (sortOrder as number) < 0 || (sortOrder as number) > 1000) {
    throw new BadRequestException('sortOrder must be an integer between 0 and 1000.');
  }

  return {
    ownerType: req.ownerType as MediaOwnerType,
    ownerId: req.ownerId.trim(),
    visibility: req.visibility as MediaVisibility,
    filename: req.filename.trim(),
    mimeType: req.mimeType as MediaMimeType,
    sizeBytes: req.sizeBytes,
    content: req.content,
    assetType: req.assetType as MediaAssetType | undefined,
    sortOrder: sortOrder as number
  };
}
