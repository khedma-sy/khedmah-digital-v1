-- Separate direct-delivery details from taxi trips and retain auditable pickup/drop-off proof.
ALTER TABLE mobility_requests
  ADD COLUMN delivery_contract_version SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN package_description TEXT,
  ADD COLUMN package_size TEXT,
  ADD COLUMN recipient_name TEXT,
  ADD COLUMN recipient_phone TEXT,
  ADD COLUMN delivery_instructions TEXT,
  ADD COLUMN pickup_verification_hash TEXT,
  ADD COLUMN delivery_verification_hash TEXT,
  ADD COLUMN pickup_verified_at TIMESTAMPTZ,
  ADD COLUMN delivery_verified_at TIMESTAMPTZ,
  ADD CONSTRAINT mobility_requests_package_size_check
    CHECK (package_size IS NULL OR package_size IN ('small','medium','large')),
  ADD CONSTRAINT mobility_requests_delivery_shape_check CHECK (
    (service_type = 'taxi' AND delivery_contract_version = 1 AND package_description IS NULL AND package_size IS NULL
      AND recipient_name IS NULL AND recipient_phone IS NULL AND delivery_instructions IS NULL
      AND pickup_verification_hash IS NULL AND delivery_verification_hash IS NULL)
    OR
    (service_type = 'delivery' AND delivery_contract_version = 1)
    OR
    (service_type = 'delivery' AND delivery_contract_version = 2 AND length(trim(package_description)) BETWEEN 2 AND 300
      AND package_size IN ('small','medium','large') AND length(trim(recipient_name)) BETWEEN 2 AND 120
      AND length(trim(recipient_phone)) BETWEEN 6 AND 30 AND pickup_verification_hash IS NOT NULL
      AND delivery_verification_hash IS NOT NULL)
  ) NOT VALID,
  ADD CONSTRAINT mobility_requests_delivery_proof_time_check CHECK (
    (pickup_verified_at IS NULL OR service_type = 'delivery')
    AND (delivery_verified_at IS NULL OR (service_type = 'delivery' AND pickup_verified_at IS NOT NULL))
  );

CREATE INDEX mobility_requests_delivery_recipient_idx
  ON mobility_requests(recipient_phone, created_at DESC)
  WHERE service_type = 'delivery';
