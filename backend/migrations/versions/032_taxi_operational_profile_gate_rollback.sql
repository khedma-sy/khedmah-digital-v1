-- Roll back only the Migration 032 profile-readiness hardening and restore the
-- Migration 031 actor resolver. Tables, approvals and approval events remain intact.
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
