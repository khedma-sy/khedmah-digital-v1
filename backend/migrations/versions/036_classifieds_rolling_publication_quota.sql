-- Replace the original lifetime quota with rolling publication windows.
-- Existing immutable publication receipts remain audit history; only recent receipts count.
CREATE OR REPLACE FUNCTION enforce_ad_free_slot_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('ad-free-slot:' || NEW.owner_user_id, 0));

  IF (
    SELECT count(*) FROM ad_free_slots
    WHERE owner_user_id=NEW.owner_user_id
      AND consumed_at > clock_timestamp() - interval '24 hours'
  ) >= 3 THEN
    RAISE EXCEPTION 'AD_DAILY_QUOTA_EXHAUSTED' USING ERRCODE='23514';
  END IF;

  IF (
    SELECT count(*) FROM ad_free_slots
    WHERE owner_user_id=NEW.owner_user_id
      AND consumed_at > clock_timestamp() - interval '7 days'
  ) >= 5 THEN
    RAISE EXCEPTION 'AD_WEEKLY_QUOTA_EXHAUSTED' USING ERRCODE='23514';
  END IF;

  RETURN NEW;
END $$;
