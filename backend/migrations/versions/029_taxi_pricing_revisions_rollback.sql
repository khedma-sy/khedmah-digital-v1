DROP TRIGGER IF EXISTS taxi_pricing_revisions_append_only ON taxi_pricing_revisions;
DROP FUNCTION IF EXISTS reject_taxi_pricing_revision_mutation();
DROP TABLE IF EXISTS taxi_pricing_revisions;
