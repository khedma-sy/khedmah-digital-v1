-- Discovery-only supplier capability; no transactions, pricing, shipping, MOQ, orders or payments.
CREATE TABLE supplier_capabilities (
  supplier_capability_identifier TEXT PRIMARY KEY,
  business_profile_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  supplier_type TEXT NOT NULL CHECK (supplier_type IN ('manufacturer','distributor','wholesaler','service_supplier')),
  coverage_location_identifier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT supplier_capabilities_business_coverage_unique UNIQUE (business_profile_id, supplier_type, coverage_location_identifier)
);
CREATE INDEX supplier_capabilities_discovery_idx ON supplier_capabilities(supplier_type, coverage_location_identifier) WHERE status = 'active';
