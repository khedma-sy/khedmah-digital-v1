-- Migration 004 Rollback: Drop analytics events and contact tables
DROP TABLE IF EXISTS contact_action_events;
DROP TABLE IF EXISTS contact_inquiries;
DROP TABLE IF EXISTS business_profiles;
DROP TABLE IF EXISTS analytics_events;
