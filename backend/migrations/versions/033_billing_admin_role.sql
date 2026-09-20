-- Authorize the dedicated Billing administrator role used by the Billing service.
-- The canonical role check is replaced atomically; no role assignments are rewritten.
BEGIN;

LOCK TABLE public.admin_roles IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.admin_roles
  DROP CONSTRAINT admin_roles_role_check;

ALTER TABLE public.admin_roles
  ADD CONSTRAINT admin_roles_role_check
  CHECK (role IN ('bootstrap_admin', 'platform_admin', 'moderator', 'billing_admin'));

COMMIT;
