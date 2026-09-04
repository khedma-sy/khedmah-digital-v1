DROP INDEX IF EXISTS mobility_requests_delivery_recipient_idx;
ALTER TABLE mobility_requests
  DROP CONSTRAINT IF EXISTS mobility_requests_delivery_proof_time_check,
  DROP CONSTRAINT IF EXISTS mobility_requests_delivery_shape_check,
  DROP CONSTRAINT IF EXISTS mobility_requests_package_size_check,
  DROP COLUMN IF EXISTS delivery_verified_at,
  DROP COLUMN IF EXISTS pickup_verified_at,
  DROP COLUMN IF EXISTS delivery_verification_hash,
  DROP COLUMN IF EXISTS pickup_verification_hash,
  DROP COLUMN IF EXISTS delivery_instructions,
  DROP COLUMN IF EXISTS recipient_phone,
  DROP COLUMN IF EXISTS recipient_name,
  DROP COLUMN IF EXISTS package_size,
  DROP COLUMN IF EXISTS package_description,
  DROP COLUMN IF EXISTS delivery_contract_version;
