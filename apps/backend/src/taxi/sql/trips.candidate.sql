-- RP33 CANDIDATE ONLY. Depends on RP32 access.candidate.sql in a disposable CI database.
-- Not registered with the migrator. No deployment action, data seed or grants at startup.
-- The caller applies schema and grants in a transaction before exposing any function.
CREATE TABLE khedmah_taxi.jt_quotes (
 id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, expires_at_ms BIGINT NOT NULL,
 payload JSONB NOT NULL, consumed_order_id TEXT UNIQUE
);
CREATE TABLE khedmah_taxi.jt_orders (
 id TEXT PRIMARY KEY, quote_id TEXT NOT NULL UNIQUE REFERENCES khedmah_taxi.jt_quotes(id),customer_id TEXT NOT NULL,
 merchant_id TEXT,provider_id TEXT,phase TEXT NOT NULL,delivery_state TEXT NOT NULL,
 version BIGINT NOT NULL CHECK(version>=1),archived BIGINT NOT NULL DEFAULT 0 CHECK(archived IN(0,1)),
 payload JSONB NOT NULL,
 CHECK(jsonb_typeof(payload)='object' AND payload ?& ARRAY['id','version','phase','kind','customerId','quote','delivery']),
 CHECK(payload->>'customerId'=customer_id),CHECK(payload->'quote'->>'id'=quote_id),
 CHECK((payload->'delivery'->>'providerId') IS NOT DISTINCT FROM provider_id),CHECK(payload->'delivery'->>'state'=delivery_state),
 CHECK(payload->>'id'=id),CHECK((payload->>'version')::bigint=version),
 CHECK(payload->>'phase'=phase),CHECK(payload->>'kind'='taxi'),
 CHECK(archived=0 OR phase IN('completed','cancelled','rejected'))
);
CREATE UNIQUE INDEX jt_one_active_job ON khedmah_taxi.jt_orders(provider_id)
 WHERE provider_id IS NOT NULL AND archived=0 AND phase NOT IN('completed','cancelled','rejected') AND delivery_state NOT IN('delivered','cancelled');
CREATE INDEX jt_customer_orders ON khedmah_taxi.jt_orders(customer_id,id);
CREATE INDEX jt_merchant_orders ON khedmah_taxi.jt_orders(merchant_id,id);
CREATE INDEX jt_job_queue ON khedmah_taxi.jt_orders(delivery_state,id) WHERE archived=0;
CREATE TABLE khedmah_taxi.jt_receipts(scope_key TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,order_id TEXT NOT NULL REFERENCES khedmah_taxi.jt_orders(id));
CREATE TABLE khedmah_taxi.jt_events(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES khedmah_taxi.jt_orders(id),version BIGINT NOT NULL,
 actor_id TEXT NOT NULL,action TEXT NOT NULL,occurred_at_ms BIGINT NOT NULL,details JSONB NOT NULL,UNIQUE(order_id,version));
CREATE TABLE khedmah_taxi.jt_outbox(event_id TEXT PRIMARY KEY REFERENCES khedmah_taxi.jt_events(id),payload JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','leased','sent')),attempts BIGINT NOT NULL DEFAULT 0 CHECK(attempts>=0),
 worker_id TEXT,lease_token TEXT,lease_until_ms BIGINT,next_attempt_ms BIGINT NOT NULL,
 CHECK(status!='leased' OR (worker_id IS NOT NULL AND lease_token IS NOT NULL AND lease_until_ms IS NOT NULL)));
CREATE INDEX jt_outbox_ready ON khedmah_taxi.jt_outbox(status,next_attempt_ms,lease_until_ms);
CREATE TABLE khedmah_taxi.jt_evidence(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES khedmah_taxi.jt_orders(id),actor_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN('arrive_pickup','finish_ride')),expected_version BIGINT NOT NULL CHECK(expected_version>=1),
 expires_at_ms BIGINT NOT NULL,source TEXT NOT NULL CHECK(length(source)>0),payload JSONB NOT NULL,consumed_event_id TEXT UNIQUE REFERENCES khedmah_taxi.jt_events(id));
-- Passenger consent is deliberately separate from trusted arrival and meter evidence.
CREATE TABLE khedmah_taxi.jt_ride_consents(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES khedmah_taxi.jt_orders(id),actor_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action='start_ride'),expected_version BIGINT NOT NULL CHECK(expected_version>=1),
 expires_at_ms BIGINT NOT NULL,source TEXT NOT NULL CHECK(source='authenticated-rider-consent'),payload JSONB NOT NULL,
 consumed_event_id TEXT UNIQUE REFERENCES khedmah_taxi.jt_events(id));
CREATE TABLE khedmah_taxi.jt_cash_receipts(event_id TEXT PRIMARY KEY REFERENCES khedmah_taxi.jt_events(id),order_id TEXT NOT NULL REFERENCES khedmah_taxi.jt_orders(id),actor_id TEXT NOT NULL,
 entry_type TEXT NOT NULL CHECK(entry_type IN('collection','settlement')),amount_minor BIGINT NOT NULL CHECK(amount_minor>=0 AND amount_minor<=9007199254740991),currency TEXT NOT NULL,occurred_at_ms BIGINT NOT NULL,
 UNIQUE(order_id,entry_type));

CREATE OR REPLACE FUNCTION khedmah_taxi.jt_reject_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'append-only audit data' USING ERRCODE='55000'; END; $$;
CREATE TRIGGER jt_no_event_rewrite BEFORE UPDATE OR DELETE ON khedmah_taxi.jt_events FOR EACH ROW EXECUTE FUNCTION khedmah_taxi.jt_reject_rewrite();
CREATE TRIGGER jt_no_cash_rewrite BEFORE UPDATE OR DELETE ON khedmah_taxi.jt_cash_receipts FOR EACH ROW EXECUTE FUNCTION khedmah_taxi.jt_reject_rewrite();

CREATE FUNCTION khedmah_taxi.jt_protect_quote() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.customer_id<>OLD.customer_id OR NEW.quote_id<>OLD.quote_id
   OR NEW.payload->'quote' IS DISTINCT FROM OLD.payload->'quote' THEN
  RAISE EXCEPTION 'immutable trip quote' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER jt_immutable_quote BEFORE UPDATE ON khedmah_taxi.jt_orders
 FOR EACH ROW EXECUTE FUNCTION khedmah_taxi.jt_protect_quote();

CREATE TABLE khedmah_taxi.tariffs(
 zone_code TEXT PRIMARY KEY, revision BIGINT NOT NULL CHECK(revision>0),
 payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object'),enabled BOOLEAN NOT NULL,
 valid_from TIMESTAMPTZ NOT NULL,valid_until TIMESTAMPTZ NOT NULL CHECK(valid_until>valid_from)
);
CREATE TABLE khedmah_taxi.routes(
 fingerprint TEXT PRIMARY KEY CHECK(fingerprint ~ '^[a-f0-9]{64}$'),id TEXT NOT NULL UNIQUE,
 zone_code TEXT NOT NULL,revision BIGINT NOT NULL CHECK(revision>0),
 distance_meters INTEGER NOT NULL CHECK(distance_meters BETWEEN 1 AND 500000),
 source TEXT NOT NULL CHECK(length(btrim(source)) BETWEEN 1 AND 100),enabled BOOLEAN NOT NULL,
 observed_at TIMESTAMPTZ NOT NULL,expires_at TIMESTAMPTZ NOT NULL CHECK(expires_at>observed_at)
);

CREATE FUNCTION khedmah_taxi.read_tariff_locked(p_zone TEXT)
RETURNS TABLE(revision TEXT,payload JSONB,valid_until TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE r khedmah_taxi.tariffs%ROWTYPE;
BEGIN
 SELECT * INTO r FROM khedmah_taxi.tariffs t WHERE t.zone_code=p_zone FOR SHARE;
 IF NOT FOUND OR NOT r.enabled OR r.valid_from>clock_timestamp() OR r.valid_until<=clock_timestamp() THEN
  RAISE EXCEPTION 'Tariff unavailable' USING ERRCODE='PT503';
 END IF;
 RETURN QUERY SELECT r.revision::TEXT,r.payload,r.valid_until;
END; $$;
CREATE FUNCTION khedmah_taxi.read_route_locked(p_zone TEXT,p_key TEXT)
RETURNS TABLE(id TEXT,revision TEXT,source TEXT,distance_meters INTEGER,expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE r khedmah_taxi.routes%ROWTYPE;
BEGIN
 SELECT * INTO r FROM khedmah_taxi.routes t WHERE t.zone_code=p_zone AND t.fingerprint=p_key FOR SHARE;
 IF NOT FOUND OR NOT r.enabled OR r.observed_at>clock_timestamp() OR r.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'Route unavailable' USING ERRCODE='PT503';
 END IF;
 RETURN QUERY SELECT r.id,r.revision::TEXT,r.source,r.distance_meters,r.expires_at;
END; $$;
REVOKE ALL ON FUNCTION khedmah_taxi.read_tariff_locked(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION khedmah_taxi.read_route_locked(TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA khedmah_taxi FROM PUBLIC;
-- Dedicated non-owner runtime: SELECT/INSERT/UPDATE aggregates, INSERT audit/outbox,
-- SELECT evidence + UPDATE(consumed_event_id) ONLY. No INSERT or payload UPDATE on jt_evidence.
-- Independent trusted writer: route/tariff writes; separate evidence issuer has only
-- INSERT of immutable evidence fields, never consumed_event_id or orders/consents.
-- Review immutable evidence retention and production roles before deploying this schema.

CREATE FUNCTION khedmah_taxi.jt_consume_once() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF OLD.consumed_event_id IS NOT NULL OR NEW.consumed_event_id IS NULL
   OR NOT EXISTS(SELECT 1 FROM khedmah_taxi.jt_events e WHERE e.id=NEW.consumed_event_id
     AND e.order_id=OLD.order_id AND e.actor_id=OLD.actor_id AND e.action=OLD.action AND e.version=OLD.expected_version+1) THEN
  RAISE EXCEPTION 'invalid evidence consumption' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER jt_evidence_once BEFORE UPDATE ON khedmah_taxi.jt_evidence
 FOR EACH ROW EXECUTE FUNCTION khedmah_taxi.jt_consume_once();
CREATE TRIGGER jt_consent_once BEFORE UPDATE ON khedmah_taxi.jt_ride_consents
 FOR EACH ROW EXECUTE FUNCTION khedmah_taxi.jt_consume_once();
