-- Canonical Taxi operational approval contract.
-- This migration promotes only driver/vehicle/zone authorization and actor resolution.
-- It does NOT create trip/dispatch tables and does NOT enable TAXI_TRIPS_ENABLED.
CREATE SCHEMA khedmah_taxi;
REVOKE ALL ON SCHEMA khedmah_taxi FROM PUBLIC;

CREATE TABLE khedmah_taxi.vehicle_approvals (
  id TEXT PRIMARY KEY,
  business_profile_id TEXT NOT NULL UNIQUE REFERENCES public.business_profiles(id) ON DELETE RESTRICT,
  driver_user_id TEXT NOT NULL REFERENCES public.core_user_accounts(user_identifier) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('approved','suspended','revoked')),
  reviewed_by TEXT NOT NULL REFERENCES public.core_user_accounts(user_identifier) ON DELETE RESTRICT,
  verification_reference TEXT NOT NULL CHECK (char_length(btrim(verification_reference)) BETWEEN 5 AND 200),
  decision_reason TEXT NOT NULL CHECK (char_length(btrim(decision_reason)) BETWEEN 10 AND 500),
  approved_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revision BIGINT NOT NULL CHECK (revision > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reviewed_by <> driver_user_id),
  CHECK (expires_at > approved_at)
);

CREATE TABLE khedmah_taxi.driver_approvals (
  user_id TEXT PRIMARY KEY REFERENCES public.core_user_accounts(user_identifier) ON DELETE RESTRICT,
  business_profile_id TEXT NOT NULL UNIQUE REFERENCES public.business_profiles(id) ON DELETE RESTRICT,
  vehicle_id TEXT NOT NULL REFERENCES khedmah_taxi.vehicle_approvals(id) ON DELETE RESTRICT,
  zone_code TEXT NOT NULL CHECK (char_length(btrim(zone_code)) BETWEEN 1 AND 80),
  status TEXT NOT NULL CHECK (status IN ('approved','suspended','revoked')),
  reviewed_by TEXT NOT NULL REFERENCES public.core_user_accounts(user_identifier) ON DELETE RESTRICT,
  verification_reference TEXT NOT NULL CHECK (char_length(btrim(verification_reference)) BETWEEN 5 AND 200),
  decision_reason TEXT NOT NULL CHECK (char_length(btrim(decision_reason)) BETWEEN 10 AND 500),
  approved_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revision BIGINT NOT NULL CHECK (revision > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reviewed_by <> user_id),
  CHECK (expires_at > approved_at)
);

CREATE TABLE khedmah_taxi.operational_approval_events (
  id TEXT PRIMARY KEY,
  business_profile_id TEXT NOT NULL REFERENCES public.business_profiles(id) ON DELETE RESTRICT,
  driver_user_id TEXT NOT NULL REFERENCES public.core_user_accounts(user_identifier) ON DELETE RESTRICT,
  vehicle_id TEXT NOT NULL,
  zone_code TEXT NOT NULL CHECK (char_length(btrim(zone_code)) BETWEEN 1 AND 80),
  decision TEXT NOT NULL CHECK (decision IN ('approved','suspended','revoked')),
  verification_reference TEXT NOT NULL CHECK (char_length(btrim(verification_reference)) BETWEEN 5 AND 200),
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500),
  actor_user_id TEXT NOT NULL REFERENCES public.core_user_accounts(user_identifier) ON DELETE RESTRICT,
  driver_revision BIGINT NOT NULL CHECK (driver_revision > 0),
  vehicle_revision BIGINT NOT NULL CHECK (vehicle_revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (actor_user_id <> driver_user_id)
);
CREATE INDEX taxi_operational_events_business_created_idx
  ON khedmah_taxi.operational_approval_events(business_profile_id, created_at DESC);

CREATE OR REPLACE FUNCTION khedmah_taxi.reject_operational_approval_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'taxi operational approval events are append-only' USING ERRCODE='55000';
END;
$$;
CREATE TRIGGER taxi_operational_approval_events_append_only
BEFORE UPDATE OR DELETE ON khedmah_taxi.operational_approval_events
FOR EACH ROW EXECUTE FUNCTION khedmah_taxi.reject_operational_approval_event_mutation();

-- Narrow SECURITY DEFINER reader used by the Taxi access gate. It performs no writes.
CREATE OR REPLACE FUNCTION khedmah_taxi.resolve_actor_locked(session_hash TEXT, wants_driver BOOLEAN)
RETURNS TABLE(user_id TEXT, vehicle_id TEXT, zone_code TEXT,
  driver_revision TEXT, vehicle_revision TEXT, valid_until TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  s public.identity_sessions%ROWTYPE;
  a public.core_user_accounts%ROWTYPE;
  d khedmah_taxi.driver_approvals%ROWTYPE;
  v khedmah_taxi.vehicle_approvals%ROWTYPE;
  deadline TIMESTAMPTZ;
BEGIN
  IF session_hash IS NULL OR length(session_hash) <> 43 OR wants_driver IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'PT401';
  END IF;
  SELECT * INTO s FROM public.identity_sessions ss WHERE ss.token_hash = session_hash FOR SHARE;
  IF NOT FOUND OR s.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'PT401';
  END IF;
  SELECT * INTO a FROM public.core_user_accounts aa WHERE aa.user_identifier = s.user_identifier FOR SHARE;
  IF NOT FOUND OR a.account_status <> 'active' OR a.lifecycle_status <> 'active' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'PT401';
  END IF;
  PERFORM c.user_identifier FROM public.identity_credentials c WHERE c.user_identifier = a.user_identifier FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'PT401'; END IF;
  PERFORM p.user_identifier FROM public.profiles p WHERE p.user_identifier = a.user_identifier
    AND p.lifecycle_status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'PT401'; END IF;
  deadline := s.expires_at;
  IF wants_driver THEN
    SELECT * INTO d FROM khedmah_taxi.driver_approvals dd WHERE dd.user_id = a.user_identifier FOR SHARE;
    IF NOT FOUND OR d.status <> 'approved' OR d.approved_at > pg_catalog.clock_timestamp() THEN
      RAISE EXCEPTION 'Approved driver and vehicle required' USING ERRCODE = 'PT403';
    END IF;
    SELECT * INTO v FROM khedmah_taxi.vehicle_approvals vv WHERE vv.id = d.vehicle_id FOR SHARE;
    IF NOT FOUND OR v.status <> 'approved' OR v.driver_user_id <> a.user_identifier
      OR v.business_profile_id <> d.business_profile_id
      OR v.approved_at > pg_catalog.clock_timestamp() THEN
      RAISE EXCEPTION 'Approved driver and vehicle required' USING ERRCODE = 'PT403';
    END IF;
    IF d.expires_at <= pg_catalog.clock_timestamp() OR v.expires_at <= pg_catalog.clock_timestamp() THEN
      RAISE EXCEPTION 'Approved driver and vehicle required' USING ERRCODE = 'PT403';
    END IF;
    deadline := LEAST(deadline, d.expires_at, v.expires_at);
  END IF;
  IF deadline <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'PT401';
  END IF;
  RETURN QUERY SELECT a.user_identifier,
    CASE WHEN wants_driver THEN v.id ELSE NULL::TEXT END,
    CASE WHEN wants_driver THEN d.zone_code ELSE NULL::TEXT END,
    CASE WHEN wants_driver THEN d.revision::TEXT ELSE NULL::TEXT END,
    CASE WHEN wants_driver THEN v.revision::TEXT ELSE NULL::TEXT END, deadline;
END;
$$;
REVOKE ALL ON FUNCTION khedmah_taxi.resolve_actor_locked(TEXT, BOOLEAN) FROM PUBLIC;
