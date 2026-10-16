-- Restore the pre-035 role set only when no specialized administrator assignment exists.
-- Existing assignments block rollback so the migration never removes role data implicitly.
BEGIN;

LOCK TABLE public.admin_roles IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.admin_roles
    WHERE role IN ('taxi_pricing_admin', 'category_admin')
  ) THEN
    RAISE EXCEPTION 'MIGRATION_035_ROLLBACK_BLOCKED: specialized admin assignments exist'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

ALTER TABLE public.admin_roles
  DROP CONSTRAINT admin_roles_role_check;

ALTER TABLE public.admin_roles
  ADD CONSTRAINT admin_roles_role_check
  CHECK (role IN ('bootstrap_admin', 'platform_admin', 'moderator', 'billing_admin'));

COMMIT;
