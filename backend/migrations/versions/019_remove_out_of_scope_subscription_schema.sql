-- Khedmah Digital V1 scope reconciliation.
-- Migration 007 introduced historical V2 subscription schema.
-- V1 does not operate plans/subscriptions.
-- This migration removes only unused subscription schema.
-- Discovery fields introduced by migration 007 remain untouched.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.subscriptions
      LIMIT 1
    ) THEN
      RAISE EXCEPTION
        'MIGRATION_019_BLOCKED: subscriptions contains data; manual disposition required';
    END IF;
  END IF;
END
$$;

DROP TABLE IF EXISTS subscriptions;

DROP TABLE IF EXISTS plans;
