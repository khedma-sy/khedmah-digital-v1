import { BadRequestException, ConflictException } from '@nestjs/common';

// Owner draft versions intentionally exclude moderation, trust, media and timestamps.
// PostgreSQL evaluates the same expression in the atomic UPDATE predicate and response.
export const BUSINESS_CONTENT_REVISION_SQL = `encode(sha256(convert_to(jsonb_build_array(id,owner_user_id,name,description_ar,description_en,phone,email,website,visibility,category_code,city_code,country_code,lat,lng,address_ar)::text,'UTF8')),'hex')`;
export const PROFESSIONAL_CONTENT_REVISION_SQL = `encode(sha256(convert_to(jsonb_build_array(professional_profile_identifier,user_identifier,headline_ar,headline_en,bio_ar,bio_en,availability,city_code,country_code,skills)::text,'UTF8')),'hex')`;

export function requireContentRevision(expected: unknown, current: string | undefined): string {
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) {
    throw new BadRequestException('A valid expectedContentRevision is required. Reload the current profile.');
  }
  if (expected !== current) throw new ConflictException('Profile content changed. Reload the current profile before saving.');
  return expected;
}
