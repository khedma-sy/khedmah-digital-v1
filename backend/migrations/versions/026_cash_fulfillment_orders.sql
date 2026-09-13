-- Cash fulfillment for food, grocery and pharmacy listings.
-- No online payment or automated medical approval. Courier tracking retains only the latest point.
ALTER TABLE product_listings
  ADD COLUMN requires_prescription BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN controlled_item BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE fulfillment_orders (
  id TEXT PRIMARY KEY,
  customer_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  merchant_business_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE RESTRICT,
  courier_business_id TEXT REFERENCES business_profiles(id) ON DELETE RESTRICT,
  vertical TEXT NOT NULL CHECK (vertical IN ('food','grocery','pharmacy')),
  status TEXT NOT NULL DEFAULT 'placed' CHECK (status IN (
    'placed','quoted','merchant_confirmed','courier_assigned','courier_accepted',
    'ready_for_pickup','picked_up','delivered','rejected','cancelled'
  )),
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method = 'cash'),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','cash_collected')),
  currency TEXT NOT NULL CHECK (currency IN ('SYP','USD')),
  subtotal NUMERIC(14,2) NOT NULL CHECK (subtotal > 0),
  delivery_fee NUMERIC(14,2) CHECK (delivery_fee >= 0),
  total NUMERIC(14,2) CHECK (total > 0),
  delivery_address TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(delivery_address)) BETWEEN 5 AND 300),
  customer_phone TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(customer_phone)) BETWEEN 6 AND 30),
  delivery_latitude NUMERIC(9,6) CHECK (delivery_latitude BETWEEN -90 AND 90),
  delivery_longitude NUMERIC(9,6) CHECK (delivery_longitude BETWEEN -180 AND 180),
  customer_note TEXT CHECK (customer_note IS NULL OR CHAR_LENGTH(customer_note) <= 500),
  prescription_attested BOOLEAN NOT NULL DEFAULT FALSE,
  pharmacy_review_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (pharmacy_review_status IN ('not_required','pending','approved','rejected')),
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR CHAR_LENGTH(rejection_reason) <= 300),
  idempotency_key TEXT NOT NULL CHECK (CHAR_LENGTH(idempotency_key) BETWEEN 16 AND 128),
  quoted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fulfillment_orders_coordinates_pair CHECK ((delivery_latitude IS NULL) = (delivery_longitude IS NULL)),
  CONSTRAINT fulfillment_orders_total_contract CHECK (
    (delivery_fee IS NULL AND total IS NULL) OR total = subtotal + delivery_fee
  ),
  CONSTRAINT fulfillment_orders_customer_idempotency_unique UNIQUE (customer_user_id, idempotency_key)
);

CREATE TABLE fulfillment_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES fulfillment_orders(id) ON DELETE CASCADE,
  product_listing_id TEXT NOT NULL REFERENCES product_listings(id) ON DELETE RESTRICT,
  title_ar TEXT NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price > 0),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 50),
  requires_prescription BOOLEAN NOT NULL,
  line_total NUMERIC(14,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
  CONSTRAINT fulfillment_order_items_product_unique UNIQUE (order_id, product_listing_id)
);

CREATE TABLE fulfillment_order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES fulfillment_orders(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT CHECK (reason IS NULL OR CHAR_LENGTH(reason) <= 300),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE fulfillment_order_ratings (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES fulfillment_orders(id) ON DELETE CASCADE,
  customer_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  target_type TEXT NOT NULL CHECK (target_type IN ('merchant','courier')),
  target_business_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE RESTRICT,
  score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT CHECK (comment IS NULL OR CHAR_LENGTH(comment) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fulfillment_order_ratings_target_unique UNIQUE (order_id, target_type)
);

CREATE TABLE fulfillment_order_location_updates (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES fulfillment_orders(id) ON DELETE CASCADE,
  courier_business_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE RESTRICT,
  latitude NUMERIC(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters NUMERIC(8,2) CHECK (accuracy_meters IS NULL OR accuracy_meters BETWEEN 0 AND 5000),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fulfillment_order_location_order_unique UNIQUE (order_id)
);

CREATE INDEX fulfillment_orders_customer_created_idx ON fulfillment_orders(customer_user_id, created_at DESC);
CREATE INDEX fulfillment_orders_merchant_status_idx ON fulfillment_orders(merchant_business_id, status, created_at DESC);
CREATE INDEX fulfillment_orders_courier_status_idx ON fulfillment_orders(courier_business_id, status, created_at DESC) WHERE courier_business_id IS NOT NULL;
CREATE INDEX fulfillment_order_events_order_time_idx ON fulfillment_order_events(order_id, occurred_at);
CREATE INDEX fulfillment_order_ratings_target_idx ON fulfillment_order_ratings(target_business_id, target_type, created_at DESC);
