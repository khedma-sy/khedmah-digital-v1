-- SEQ-02I: canonical, platform-governed Category authority.
-- No seed rows are introduced: taxonomy records require an explicit governed source.
CREATE TABLE categories (
  code TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_code_format_check CHECK (code ~ '^[a-z][a-z0-9_]{1,49}$'),
  CONSTRAINT categories_name_ar_not_blank_check CHECK (BTRIM(name_ar) <> ''),
  CONSTRAINT categories_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT categories_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX categories_public_order_idx ON categories(status, sort_order, code);

-- Existing installations may contain legacy free-text values. NOT VALID preserves
-- upgrade safety while enforcing canonical references for every new/updated row.
ALTER TABLE business_profiles
  ADD CONSTRAINT business_profiles_category_code_fk
  FOREIGN KEY (category_code) REFERENCES categories(code) ON UPDATE CASCADE NOT VALID;

ALTER TABLE service_listings
  ADD CONSTRAINT service_listings_category_code_fk
  FOREIGN KEY (category_code) REFERENCES categories(code) ON UPDATE CASCADE NOT VALID;
