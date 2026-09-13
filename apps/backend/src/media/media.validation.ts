import { BadRequestException } from '@nestjs/common';
import { UploadMediaRequest } from './media.types';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const OWNER_TYPES = new Set(['business_profile', 'professional_profile', 'product_listing', 'user']);
const DRIVER_DOCUMENT_TYPES = new Set(['driver_photo', 'identity_card', 'driving_license', 'vehicle_license']);
const ASSET_TYPES = new Set(['logo', 'cover', 'gallery', 'profile_image', 'service_image', 'product_image', ...DRIVER_DOCUMENT_TYPES]);
const MAX_SIZE = 5 * 1024 * 1024;
const businessAssetTypes = new Set(['logo', 'cover', 'gallery', ...DRIVER_DOCUMENT_TYPES]);
const professionalAssetTypes = new Set(['profile_image','service_image']);

const clean = (value: unknown, field: string, max: number) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${field} is invalid.`);
  return value.trim();
};

export function validateUploadMediaRequest(request: UploadMediaRequest): Required<Omit<UploadMediaRequest, 'assetType'>> & Pick<UploadMediaRequest, 'assetType'> {
  const ownerType = clean(request.ownerType, 'ownerType', 40);
  const ownerId = clean(request.ownerId, 'ownerId', 120);
  const filename = clean(request.filename, 'filename', 200).replace(/[\\/]/g, '_');
  const mimeType = clean(request.mimeType, 'mimeType', 40);
  if (!OWNER_TYPES.has(ownerType)) throw new BadRequestException('ownerType is not allowed.');
  if (!ALLOWED_MIME.has(mimeType)) throw new BadRequestException('Only JPEG, PNG, and WebP images are allowed.');
  if (!Number.isInteger(request.sizeBytes) || request.sizeBytes <= 0 || request.sizeBytes > MAX_SIZE) throw new BadRequestException('Image size must be between 1 byte and 5 MB.');
  if (typeof request.content !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(request.content) || request.content.length > Math.ceil(MAX_SIZE / 3) * 4 + 4) throw new BadRequestException('Image content must be valid base64.');
  const visibility = request.visibility ?? 'public';
  if (visibility !== 'public' && visibility !== 'private') throw new BadRequestException('visibility is invalid.');
  const assetType = request.assetType;
  if (assetType !== undefined && !ASSET_TYPES.has(assetType)) throw new BadRequestException('assetType is invalid.');
  if (ownerType === 'business_profile' && assetType && !businessAssetTypes.has(assetType)) throw new BadRequestException('Business media requires logo, cover, or gallery, or a governed private driver document.');
  if (ownerType === 'professional_profile' && assetType && !professionalAssetTypes.has(assetType)) throw new BadRequestException('Professional media assetType is invalid.');
  if (ownerType === 'product_listing' && assetType !== 'product_image') throw new BadRequestException('Product media requires product_image assetType.');
  if (ownerType === 'user' && assetType !== undefined) throw new BadRequestException('User media does not accept assetType.');
  if (assetType && DRIVER_DOCUMENT_TYPES.has(assetType) && (ownerType !== 'business_profile' || visibility !== 'private')) {
    throw new BadRequestException('Driver documents must be private business media.');
  }
  const sortOrder = request.sortOrder ?? 0;
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100) throw new BadRequestException('sortOrder is invalid.');
  return { ownerType: ownerType as UploadMediaRequest['ownerType'], ownerId, filename, mimeType: mimeType as UploadMediaRequest['mimeType'], sizeBytes: request.sizeBytes, content: request.content, visibility, assetType, sortOrder };
}
