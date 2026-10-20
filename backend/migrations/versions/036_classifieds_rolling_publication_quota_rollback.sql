-- Restore migration 025's lifetime three-publication quota.
CREATE OR REPLACE FUNCTION enforce_ad_free_slot_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('ad-free-slot:' || NEW.owner_user_id, 0));
  IF (SELECT count(*) FROM ad_free_slots WHERE owner_user_id=NEW.owner_user_id) >= 3 THEN
    RAISE EXCEPTION 'AD_FREE_QUOTA_EXHAUSTED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
