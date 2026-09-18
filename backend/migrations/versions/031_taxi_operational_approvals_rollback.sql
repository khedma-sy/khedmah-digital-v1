-- Roll back only the canonical Taxi operational approval contract.
DROP FUNCTION IF EXISTS khedmah_taxi.resolve_actor_locked(TEXT, BOOLEAN);
DROP TRIGGER IF EXISTS taxi_operational_approval_events_append_only ON khedmah_taxi.operational_approval_events;
DROP FUNCTION IF EXISTS khedmah_taxi.reject_operational_approval_event_mutation();
DROP TABLE IF EXISTS khedmah_taxi.operational_approval_events;
DROP TABLE IF EXISTS khedmah_taxi.driver_approvals;
DROP TABLE IF EXISTS khedmah_taxi.vehicle_approvals;
DROP SCHEMA IF EXISTS khedmah_taxi;
