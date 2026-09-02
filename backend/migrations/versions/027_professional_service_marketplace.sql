-- Auditable home-services marketplace: customer problem, provider offers, cash job and warranty.
CREATE TABLE professional_service_requests (
  id TEXT PRIMARY KEY,
  customer_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  category_code TEXT NOT NULL REFERENCES categories(code) ON UPDATE CASCADE,
  title_ar TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(title_ar)) BETWEEN 4 AND 160),
  description_ar TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(description_ar)) BETWEEN 10 AND 2000),
  urgency TEXT NOT NULL CHECK (urgency IN ('urgent','today','scheduled')),
  scheduled_for TIMESTAMPTZ,
  budget_min NUMERIC(14,2) CHECK (budget_min IS NULL OR budget_min >= 0),
  budget_max NUMERIC(14,2) CHECK (budget_max IS NULL OR budget_max >= 0),
  currency TEXT NOT NULL DEFAULT 'SYP' CHECK (currency IN ('SYP','USD')),
  address TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(address)) BETWEEN 5 AND 300),
  area_label TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(area_label)) BETWEEN 2 AND 120),
  latitude NUMERIC(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  customer_phone TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(customer_phone)) BETWEEN 6 AND 30),
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method = 'cash'),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','cash_collected')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','offer_selected','in_progress','completion_pending','completed','cancelled','disputed')),
  accepted_offer_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT professional_service_requests_schedule CHECK ((urgency = 'scheduled') = (scheduled_for IS NOT NULL)),
  CONSTRAINT professional_service_requests_budget CHECK (budget_min IS NULL OR budget_max IS NULL OR budget_max >= budget_min)
);

CREATE TABLE professional_service_offers (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES professional_service_requests(id) ON DELETE CASCADE,
  provider_business_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE RESTRICT,
  provider_owner_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  inspection_fee NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (inspection_fee >= 0),
  labor_fee NUMERIC(14,2) NOT NULL CHECK (labor_fee >= 0),
  materials_fee NUMERIC(14,2) CHECK (materials_fee IS NULL OR materials_fee >= 0),
  currency TEXT NOT NULL CHECK (currency IN ('SYP','USD')),
  arrival_minutes INTEGER NOT NULL CHECK (arrival_minutes BETWEEN 1 AND 10080),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 43200),
  warranty_days INTEGER NOT NULL DEFAULT 0 CHECK (warranty_days BETWEEN 0 AND 3650),
  scope_ar TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(scope_ar)) BETWEEN 10 AND 1200),
  exclusions_ar TEXT CHECK (exclusions_ar IS NULL OR CHAR_LENGTH(exclusions_ar) <= 800),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','accepted','rejected','withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT professional_service_offers_provider_unique UNIQUE (request_id, provider_business_id)
);

ALTER TABLE professional_service_requests
  ADD CONSTRAINT professional_service_requests_accepted_offer_fkey
  FOREIGN KEY (accepted_offer_id) REFERENCES professional_service_offers(id) ON DELETE RESTRICT;

CREATE TABLE professional_service_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES professional_service_requests(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT CHECK (note IS NULL OR CHAR_LENGTH(note) <= 500),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE professional_service_warranties (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES professional_service_requests(id) ON DELETE CASCADE,
  provider_business_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE RESTRICT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  terms_ar TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(terms_ar)) BETWEEN 5 AND 1000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revisit_requested','resolved','expired','void')),
  revisit_reason TEXT CHECK (revisit_reason IS NULL OR CHAR_LENGTH(revisit_reason) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT professional_service_warranties_period CHECK (ends_at >= starts_at)
);

CREATE TABLE professional_service_ratings (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES professional_service_requests(id) ON DELETE CASCADE,
  customer_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  provider_business_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE RESTRICT,
  quality SMALLINT NOT NULL CHECK (quality BETWEEN 1 AND 5),
  punctuality SMALLINT NOT NULL CHECK (punctuality BETWEEN 1 AND 5),
  price_accuracy SMALLINT NOT NULL CHECK (price_accuracy BETWEEN 1 AND 5),
  conduct SMALLINT NOT NULL CHECK (conduct BETWEEN 1 AND 5),
  comment TEXT CHECK (comment IS NULL OR CHAR_LENGTH(comment) <= 800),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX professional_requests_customer_created_idx ON professional_service_requests(customer_user_id, created_at DESC);
CREATE INDEX professional_requests_category_open_idx ON professional_service_requests(category_code, created_at DESC) WHERE status = 'open';
CREATE INDEX professional_offers_request_created_idx ON professional_service_offers(request_id, created_at);
CREATE INDEX professional_events_request_time_idx ON professional_service_events(request_id, occurred_at);

ALTER TABLE media_assets
  DROP CONSTRAINT media_assets_owner_type_check,
  ADD CONSTRAINT media_assets_owner_type_check
    CHECK (owner_type IN ('business_profile','professional_profile','product_listing','professional_request','user')),
  DROP CONSTRAINT media_assets_asset_type_check,
  ADD CONSTRAINT media_assets_asset_type_check
    CHECK (asset_type IN ('logo','cover','gallery','profile_image','service_image','product_image','problem_image','completion_image'));
