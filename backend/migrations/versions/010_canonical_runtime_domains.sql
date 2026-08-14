-- Canonical runtime domain structures shared by Business, Professional, Organizations, Search and trust.
CREATE TABLE locations (
  location_identifier TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  city_code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  lifecycle_status TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN ('active','inactive'))
);

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE organization_members (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('owner','member')),
  status TEXT NOT NULL CHECK (status IN ('active','removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX org_members_user_id_idx ON organization_members(user_id);

ALTER TABLE business_profiles ADD CONSTRAINT business_profiles_organization_fk
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;

CREATE TABLE roles (role_identifier TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE);
CREATE TABLE permissions (permission_identifier TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE);
CREATE TABLE role_permissions (
  role_identifier TEXT NOT NULL REFERENCES roles(role_identifier) ON DELETE CASCADE,
  permission_identifier TEXT NOT NULL REFERENCES permissions(permission_identifier) ON DELETE CASCADE,
  PRIMARY KEY (role_identifier, permission_identifier)
);

ALTER TABLE professional_profiles
  ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT professional_profiles_moderation_status_check CHECK (moderation_status IN ('pending','approved','rejected','suspended')),
  ADD COLUMN headline_ar TEXT,
  ADD COLUMN headline_en TEXT,
  ADD COLUMN bio_ar TEXT,
  ADD COLUMN bio_en TEXT,
  ADD COLUMN availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available','busy','unavailable')),
  ADD COLUMN city_code TEXT,
  ADD COLUMN country_code TEXT NOT NULL DEFAULT 'SY',
  ADD COLUMN skills TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN featured_at TIMESTAMPTZ;
CREATE INDEX professional_profiles_public_eligibility_idx
  ON professional_profiles(created_at DESC)
  WHERE visibility = 'public' AND moderation_status = 'approved' AND lifecycle_status = 'active';

CREATE TABLE service_listings (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('business','professional')),
  owner_id TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  title_en TEXT,
  description_ar TEXT,
  description_en TEXT,
  category_code TEXT NOT NULL,
  price NUMERIC,
  price_currency TEXT DEFAULT 'SYP',
  price_type TEXT NOT NULL DEFAULT 'negotiable' CHECK (price_type IN ('fixed','hourly','negotiable')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  featured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX service_listings_owner_idx ON service_listings(owner_id, owner_type);

CREATE TABLE business_opening_hours (
  id TEXT PRIMARY KEY, business_profile_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), open_time TEXT NOT NULL, close_time TEXT NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE business_branches (
  id TEXT PRIMARY KEY, business_profile_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL, name_en TEXT, address_ar TEXT, phone TEXT, city_code TEXT NOT NULL, lat NUMERIC, lng NUMERIC,
  is_main BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE business_social_links (
  id TEXT PRIMARY KEY, business_profile_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, url TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE verification_requests (
  id TEXT PRIMARY KEY, entity_type TEXT NOT NULL CHECK (entity_type IN ('business','professional')), entity_id TEXT NOT NULL,
  requester_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier), status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  notes TEXT, reviewed_by TEXT REFERENCES core_user_accounts(user_identifier), reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE trust_history (
  id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, old_status TEXT, new_status TEXT NOT NULL,
  changed_by TEXT REFERENCES core_user_accounts(user_identifier), reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
