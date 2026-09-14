-- Product V2 billing, subscriptions and usage credits.
-- Money is stored in qirsh: 100 minor units = 1 new Syrian pound (SYP_NEW_2026).
CREATE TABLE billing_program_config (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  currency TEXT NOT NULL CHECK (currency = 'SYP'),
  currency_era TEXT NOT NULL CHECK (currency_era = 'SYP_NEW_2026'),
  welcome_points BIGINT NOT NULL CHECK (welcome_points >= 0 AND welcome_points <= 1000000),
  welcome_expiry_days INTEGER NOT NULL CHECK (welcome_expiry_days BETWEEN 1 AND 3650),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO billing_program_config(id,currency,currency_era,welcome_points,welcome_expiry_days)
VALUES('default','SYP','SYP_NEW_2026',100,30);

CREATE TABLE billing_plans (
  code TEXT PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{2,49}$'),
  family TEXT NOT NULL CHECK (family IN ('starter','growth','business')),
  name_ar TEXT NOT NULL,
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly','annual')),
  duration_months INTEGER NOT NULL CHECK (duration_months IN (1,12)),
  price_minor BIGINT NOT NULL CHECK (price_minor >= 0 AND price_minor <= 1000000000),
  currency TEXT NOT NULL DEFAULT 'SYP' CHECK (currency = 'SYP'),
  currency_era TEXT NOT NULL DEFAULT 'SYP_NEW_2026' CHECK (currency_era = 'SYP_NEW_2026'),
  points_granted BIGINT NOT NULL CHECK (points_granted > 0 AND points_granted <= 10000000),
  features JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(features) = 'array'),
  published BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO billing_plans(code,family,name_ar,billing_cycle,duration_months,price_minor,points_granted,features,sort_order) VALUES
('starter_monthly','starter','بداية شهري','monthly',1,150000,500,'["ملف أعمال","استهلاك بالنقاط"]',10),
('starter_annual','starter','بداية سنوي','annual',12,1500000,6500,'["ملف أعمال","استهلاك بالنقاط","أفضلية سعر سنوية"]',11),
('growth_monthly','growth','نمو شهري','monthly',1,450000,2000,'["أدوات نمو","نقاط أكثر","تقارير"]',20),
('growth_annual','growth','نمو سنوي','annual',12,4500000,26000,'["أدوات نمو","نقاط أكثر","تقارير","أفضلية سعر سنوية"]',21),
('business_monthly','business','أعمال شهري','monthly',1,900000,5000,'["تشغيل موسع","نقاط عالية","تقارير متقدمة"]',30),
('business_annual','business','أعمال سنوي','annual',12,9000000,65000,'["تشغيل موسع","نقاط عالية","تقارير متقدمة","أفضلية سعر سنوية"]',31);

CREATE TABLE billing_promo_codes (
  code TEXT PRIMARY KEY CHECK (code ~ '^[A-Z0-9_-]{4,32}$'),
  percentage_off INTEGER NOT NULL CHECK (percentage_off BETWEEN 1 AND 100),
  message_ar TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL CHECK (valid_until > valid_from),
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  per_user_limit INTEGER NOT NULL DEFAULT 1 CHECK (per_user_limit BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO billing_promo_codes(code,percentage_off,message_ar,valid_from,valid_until,max_redemptions,per_user_limit)
VALUES('KHEDMA30',30,'عرض الانطلاق: استخدم كود KHEDMA30 واحصل على خصم 30% على أول باقة مدفوعة.',NOW(),TIMESTAMPTZ '2026-12-31 23:59:59+03',NULL,1);

CREATE TABLE billing_purchase_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  plan_code TEXT NOT NULL REFERENCES billing_plans(code),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  total_minor BIGINT NOT NULL CHECK (total_minor >= 0),
  currency TEXT NOT NULL CHECK (currency = 'SYP'),
  currency_era TEXT NOT NULL CHECK (currency_era = 'SYP_NEW_2026'),
  promo_code TEXT REFERENCES billing_promo_codes(code),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled','expired')),
  external_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  CONSTRAINT billing_purchase_user_request_unique UNIQUE(user_id,request_key),
  CONSTRAINT billing_purchase_math_check CHECK (amount_minor - discount_minor = total_minor)
);
CREATE INDEX billing_purchase_user_created_idx ON billing_purchase_orders(user_id,created_at DESC);
CREATE INDEX billing_purchase_pending_idx ON billing_purchase_orders(status,created_at) WHERE status='pending';

CREATE TABLE billing_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  plan_code TEXT NOT NULL REFERENCES billing_plans(code),
  purchase_order_id TEXT NOT NULL UNIQUE REFERENCES billing_purchase_orders(id),
  status TEXT NOT NULL CHECK (status IN ('active','expired','cancelled','superseded')),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL CHECK (period_end > period_start),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX billing_one_active_subscription_idx ON billing_subscriptions(user_id) WHERE status='active';
CREATE INDEX billing_subscription_user_period_idx ON billing_subscriptions(user_id,period_end DESC);

CREATE TABLE billing_credit_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  grant_key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('welcome','subscription','promotion','adjustment')),
  points_granted BIGINT NOT NULL CHECK (points_granted > 0),
  points_remaining BIGINT NOT NULL CHECK (points_remaining >= 0 AND points_remaining <= points_granted),
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  source_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at IS NULL OR expires_at > effective_at)
);
CREATE INDEX billing_credit_available_idx ON billing_credit_grants(user_id,expires_at,effective_at) WHERE points_remaining > 0;

CREATE TABLE billing_credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  grant_id TEXT NOT NULL REFERENCES billing_credit_grants(id) ON DELETE RESTRICT,
  entry_key TEXT NOT NULL UNIQUE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('grant','consume','restore','expire','adjustment')),
  points_delta BIGINT NOT NULL CHECK (points_delta <> 0),
  feature_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX billing_ledger_user_created_idx ON billing_credit_ledger(user_id,created_at DESC);

CREATE TABLE billing_usage_rates (
  feature_code TEXT PRIMARY KEY CHECK (feature_code ~ '^[a-z][a-z0-9_.-]{2,63}$'),
  label_ar TEXT NOT NULL,
  points_cost BIGINT NOT NULL CHECK (points_cost > 0 AND points_cost <= 1000000),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO billing_usage_rates(feature_code,label_ar,points_cost) VALUES
('ad.publish','نشر إعلان إضافي',10),
('promotion.publish','نشر عرض ترويجي',20),
('featured.day','إبراز لمدة يوم',25),
('media.extra','مساحة وسائط إضافية',2);

CREATE TABLE billing_usage_receipts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  feature_code TEXT NOT NULL REFERENCES billing_usage_rates(feature_code),
  points_consumed BIGINT NOT NULL CHECK (points_consumed > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id,idempotency_key)
);

CREATE TABLE billing_promo_redemptions (
  id TEXT PRIMARY KEY,
  promo_code TEXT NOT NULL REFERENCES billing_promo_codes(code),
  user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  purchase_order_id TEXT NOT NULL UNIQUE REFERENCES billing_purchase_orders(id),
  percentage_off INTEGER NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX billing_promo_user_code_idx ON billing_promo_redemptions(user_id,promo_code);

CREATE OR REPLACE FUNCTION reject_billing_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'billing ledger is append-only' USING ERRCODE='55000'; END; $$;
CREATE TRIGGER billing_credit_ledger_no_rewrite BEFORE UPDATE OR DELETE ON billing_credit_ledger FOR EACH ROW EXECUTE FUNCTION reject_billing_ledger_mutation();
CREATE TRIGGER billing_usage_receipts_no_rewrite BEFORE UPDATE OR DELETE ON billing_usage_receipts FOR EACH ROW EXECUTE FUNCTION reject_billing_ledger_mutation();
CREATE TRIGGER billing_promo_redemptions_no_rewrite BEFORE UPDATE OR DELETE ON billing_promo_redemptions FOR EACH ROW EXECUTE FUNCTION reject_billing_ledger_mutation();

CREATE OR REPLACE FUNCTION grant_welcome_credit_on_login() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cfg billing_program_config%ROWTYPE; grant_id TEXT;
BEGIN
  SELECT * INTO cfg FROM billing_program_config WHERE id='default';
  IF cfg.welcome_points <= 0 THEN RETURN NEW; END IF;
  grant_id := 'welcome_' || NEW.user_identifier;
  INSERT INTO billing_credit_grants(id,user_id,grant_key,category,points_granted,points_remaining,effective_at,expires_at,source_ref)
  VALUES(grant_id,NEW.user_identifier,'welcome:'||NEW.user_identifier,'welcome',cfg.welcome_points,cfg.welcome_points,NOW(),NOW()+make_interval(days=>cfg.welcome_expiry_days),'first_successful_session')
  ON CONFLICT(grant_key) DO NOTHING;
  IF FOUND THEN
    INSERT INTO billing_credit_ledger(id,user_id,grant_id,entry_key,entry_type,points_delta,metadata)
    VALUES('ledger_'||grant_id,NEW.user_identifier,grant_id,'grant:'||grant_id,'grant',cfg.welcome_points,jsonb_build_object('source','welcome_login'));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER billing_welcome_after_session AFTER INSERT ON identity_sessions FOR EACH ROW EXECUTE FUNCTION grant_welcome_credit_on_login();
