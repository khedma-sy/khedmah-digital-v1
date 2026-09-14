#!/bin/sh
set -eu

readonly DEFAULT_026='/migrations/026_cash_fulfillment_orders.sql'
readonly DEFAULT_027='/migrations/027_mobility_document_reviews.sql'
readonly DEFAULT_028='/migrations/028_platform_notifications.sql'
readonly DEFAULT_LEGACY_165_RECONCILE='/migrations/reconcile_legacy_165_mobility_documents.sql'
readonly APPROVED_026_BLOB='751262c11264815488136847e39e3dc162feab85'
readonly APPROVED_027_BLOB='af18327bf03735f6ceaba5f5a60ab973822db355'
readonly APPROVED_028_BLOB='a4dc42dac87226a3628d282d027164e33212c493'
readonly APPROVED_LEGACY_165_RECONCILE_BLOB='69847edcb060f4a621eab813f967d133d93cda31'

migration_026="${FULFILLMENT_MIGRATION_026_FILE:-$DEFAULT_026}"
migration_027="${FULFILLMENT_MIGRATION_027_FILE:-$DEFAULT_027}"
migration_028="${FULFILLMENT_MIGRATION_028_FILE:-$DEFAULT_028}"
legacy_165_reconcile="${FULFILLMENT_LEGACY_165_RECONCILE_FILE:-$DEFAULT_LEGACY_165_RECONCILE}"
environment="${DEPLOYMENT_ENVIRONMENT:-}"
mode="${MIGRATION_MODE:-verify}"
project="${GOOGLE_CLOUD_PROJECT:-}"
production_project="${PRODUCTION_GOOGLE_CLOUD_PROJECT:-}"

case "$environment" in
  preview|staging) ;;
  *) echo 'ERROR: Fulfillment migrations 026-028 are allowed only in preview or staging.' >&2; exit 2 ;;
esac
case "$mode" in
  verify|apply) ;;
  *) echo 'ERROR: MIGRATION_MODE must be verify or apply.' >&2; exit 2 ;;
esac
test -n "$project" || { echo 'ERROR: GOOGLE_CLOUD_PROJECT is required.' >&2; exit 2; }
test -n "$production_project" || { echo 'ERROR: PRODUCTION_GOOGLE_CLOUD_PROJECT is required.' >&2; exit 2; }
[ "$project" != "$production_project" ] || { echo 'ERROR: Refusing fulfillment migrations 026-028 against the production project.' >&2; exit 3; }
test -n "${DATABASE_URL:-}" || { echo 'ERROR: DATABASE_URL is required.' >&2; exit 2; }

if [ "$mode" = 'apply' ]; then
  expected_confirmation="APPLY_KHEDMAH_NONPROD_026_028_$(printf '%s' "$environment" | tr '[:lower:]' '[:upper:]')"
  [ "${MIGRATION_CONFIRMATION:-}" = "$expected_confirmation" ] || { echo 'ERROR: Explicit non-production fulfillment migration confirmation is required.' >&2; exit 3; }
fi

command -v python3 >/dev/null 2>&1 || { echo 'ERROR: python3 is required for reviewed Git blob verification.' >&2; exit 52; }
verify_blob() {
  file="$1"
  approved="$2"
  actual="$(python3 - "$file" <<'PY'
from pathlib import Path
import hashlib, sys
p=Path(sys.argv[1])
data=p.read_bytes()
print(hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest())
PY
)" || exit 52
  [ "$actual" = "$approved" ] || { echo "ERROR: Reviewed migration blob mismatch for $file." >&2; exit 3; }
}
verify_blob "$migration_026" "$APPROVED_026_BLOB"
verify_blob "$migration_027" "$APPROVED_027_BLOB"
verify_blob "$migration_028" "$APPROVED_028_BLOB"
verify_blob "$legacy_165_reconcile" "$APPROVED_LEGACY_165_RECONCILE_BLOB"

# Cloud Run attaches Cloud SQL at /cloudsql/<connection-name>. DATABASE_URL
# supplies credentials/database only; its TCP host is intentionally ignored.
if [ -n "${CLOUD_SQL_INSTANCE_CONNECTION_NAME:-}" ]; then
  set +e
  connection_exports="$(DATABASE_URL="$DATABASE_URL" python3 - <<'PY'
import os, shlex
from urllib.parse import unquote, urlsplit
try:
    parsed=urlsplit(os.environ['DATABASE_URL'])
    if parsed.scheme not in ('postgres','postgresql'):
        raise ValueError('unsupported scheme')
    database=unquote(parsed.path[1:] if parsed.path.startswith('/') else parsed.path)
    if not database:
        raise ValueError('database required')
    for name,value in {
        'PGDATABASE': database,
        'PGUSER': unquote(parsed.username or ''),
        'PGPASSWORD': unquote(parsed.password or ''),
    }.items():
        print(f"{name}={shlex.quote(value)}")
except Exception:
    raise SystemExit(1)
PY
)"
  parse_status=$?
  set -e
  [ "$parse_status" -eq 0 ] || exit 52
  eval "$connection_exports"
  export PGDATABASE PGUSER PGPASSWORD
  PGHOST="/cloudsql/${CLOUD_SQL_INSTANCE_CONNECTION_NAME}"
  PGSSLMODE=disable
  export PGHOST PGSSLMODE
fi

psql_exec() {
  if [ -n "${CLOUD_SQL_INSTANCE_CONNECTION_NAME:-}" ]; then
    psql -d "$PGDATABASE" "$@"
  else
    psql -d "$DATABASE_URL" "$@"
  fi
}

# Keep authentication/connectivity distinct from catalog/schema failures.
psql_exec -X -Atq -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1 || exit 50
psql_scalar() { psql_exec -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
probe_scalar() {
  value="$(psql_scalar "$1" 2>/dev/null)" || return 49
  [ -n "$value" ] || return 51
  printf '%s' "$value"
}
probe_count() {
  value="$(probe_scalar "$1")" || return $?
  case "$value" in *[!0-9]*|'') return 51 ;; esac
  printf '%s' "$value"
}

schema_state() {
  base_count="$(probe_count "SELECT ((to_regclass(current_schema() || '.product_listings') IS NOT NULL)::int + (to_regclass(current_schema() || '.business_profiles') IS NOT NULL)::int + (to_regclass(current_schema() || '.media_assets') IS NOT NULL)::int + (to_regclass(current_schema() || '.core_user_accounts') IS NOT NULL)::int)")" || return $?
  [ "$base_count" -eq 4 ] || { printf '%s' 'missing_base'; return 0; }

  classified_count="$(probe_count "SELECT ((to_regclass(current_schema() || '.ad_listings') IS NOT NULL)::int + (EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='media_assets' AND c.conname='media_assets_owner_type_check' AND pg_get_constraintdef(c.oid) LIKE '%ad_listing%'))::int + (EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='media_assets' AND c.conname='media_assets_asset_type_check' AND pg_get_constraintdef(c.oid) LIKE '%ad_image%'))::int)")" || return $?
  [ "$classified_count" -eq 3 ] || { printf '%s' 'requires_025'; return 0; }

  table_count="$(probe_count "SELECT count(*)::int FROM information_schema.tables WHERE table_schema=current_schema() AND table_name IN ('fulfillment_orders','fulfillment_order_items','fulfillment_order_events','fulfillment_order_ratings','fulfillment_order_location_updates','mobility_document_reviews','mobility_document_review_events','platform_notifications')")" || return $?
  column_count="$(probe_count "SELECT count(*)::int FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='product_listings' AND column_name IN ('requires_prescription','controlled_item')")" || return $?
  index_count="$(probe_count "SELECT count(*)::int FROM pg_indexes WHERE schemaname=current_schema() AND indexname IN ('fulfillment_orders_customer_created_idx','fulfillment_orders_merchant_status_idx','fulfillment_orders_courier_status_idx','fulfillment_order_events_order_time_idx','fulfillment_order_ratings_target_idx','mobility_document_reviews_business_idx','mobility_document_review_events_business_idx','platform_notifications_user_created_idx','platform_notifications_user_unread_idx')")" || return $?
  function_count="$(probe_count "SELECT (to_regprocedure(current_schema() || '.create_pending_mobility_document_review()') IS NOT NULL)::int")" || return $?
  trigger_count="$(probe_count "SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND NOT t.tgisinternal AND t.tgname='media_assets_pending_mobility_document_review'")" || return $?
  media_count="$(probe_count "SELECT ((EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='media_assets' AND c.conname='media_assets_asset_type_check' AND pg_get_constraintdef(c.oid) LIKE '%driver_photo%' AND pg_get_constraintdef(c.oid) LIKE '%ad_image%'))::int + (EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='media_assets' AND c.conname='media_assets_driver_documents_private_check'))::int)")" || return $?

  total=$((table_count + column_count + index_count + function_count + trigger_count + media_count))
  if [ "$total" -eq 0 ]; then printf '%s' 'not_applied'; return 0; fi
  if [ "$table_count" -eq 8 ] && [ "$column_count" -eq 2 ] && [ "$index_count" -eq 9 ] && [ "$function_count" -eq 1 ] && [ "$trigger_count" -eq 1 ] && [ "$media_count" -eq 2 ]; then
    printf '%s' 'verified'; return 0
  fi

  # PR #165 used the same 026 and notification blobs but an older mobility
  # document-review schema numbered 033. Accept only that exact historical
  # shape; every other partial state remains fail-closed.
  legacy_index_count="$(probe_count "SELECT count(*)::int FROM pg_indexes WHERE schemaname=current_schema() AND indexname IN ('mobility_document_reviews_business_status_idx','mobility_document_review_events_business_created_idx')")" || return $?
  legacy_constraint_count="$(probe_count "SELECT count(*)::int FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND ((t.relname='mobility_document_reviews' AND c.conname='mobility_document_reviews_business_type_unique' AND c.contype='u') OR (t.relname='mobility_document_review_events' AND c.conname='mobility_document_review_events_reason_check' AND c.contype='c'))")" || return $?
  legacy_shape_count="$(probe_count "SELECT ((EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='mobility_document_review_events' AND c.conname='mobility_document_review_events_actor_user_id_fkey' AND c.contype='f' AND c.confdeltype='n'))::int + (NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='mobility_document_review_events' AND c.conname='mobility_document_review_events_media_asset_id_fkey'))::int + (EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='mobility_document_review_events' AND a.attname='actor_user_id' AND a.attnum>0 AND NOT a.attisdropped AND NOT a.attnotnull))::int + (NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname='mobility_document_reviews' AND c.conname='mobility_document_reviews_review_reason_check'))::int)")" || return $?
  legacy_column_count="$(probe_count "SELECT ((SELECT count(*) FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='mobility_document_reviews') + (SELECT count(*) FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='mobility_document_review_events'))::int")" || return $?

  if [ "$table_count" -eq 8 ] && [ "$column_count" -eq 2 ] && [ "$index_count" -eq 7 ] && [ "$function_count" -eq 0 ] && [ "$trigger_count" -eq 0 ] && [ "$media_count" -eq 0 ] && [ "$legacy_index_count" -eq 2 ] && [ "$legacy_constraint_count" -eq 2 ] && [ "$legacy_shape_count" -eq 4 ] && [ "$legacy_column_count" -eq 17 ]; then
    printf '%s' 'legacy_165_reconcilable'; return 0
  fi

  printf '%s' 'partial_or_unverified'
}

exit_for_schema_state() {
  case "$1" in
    missing_base) exit 41 ;;
    requires_025) exit 42 ;;
    not_applied) exit 43 ;;
    legacy_165_reconcilable) exit 44 ;;
    partial_or_unverified) exit 44 ;;
    *) exit 48 ;;
  esac
}

set +e
state="$(schema_state)"
state_status=$?
set -e
[ "$state_status" -eq 0 ] || exit "$state_status"
if [ "$state" = 'verified' ]; then
  printf '%s\n' "FULFILLMENT_026_028_ALREADY_APPLIED_AND_VERIFIED:${environment}:${project}"
  exit 0
fi
if [ "$mode" = 'verify' ]; then
  exit_for_schema_state "$state"
fi

if [ "$state" = 'legacy_165_reconcilable' ]; then
  psql_exec -X -v ON_ERROR_STOP=1 -f "$legacy_165_reconcile"
else
  [ "$state" = 'not_applied' ] || exit_for_schema_state "$state"

  psql_exec -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-fulfillment-026-028', 0));
DO \$guard\$
BEGIN
  IF to_regclass(current_schema() || '.ad_listings') IS NULL THEN
    RAISE EXCEPTION 'FULFILLMENT_026_028_REQUIRES_MIGRATION_025';
  END IF;
  IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=current_schema() AND t.relname='media_assets' AND c.conname='media_assets_asset_type_check'
        AND pg_get_constraintdef(c.oid) LIKE '%ad_image%'
    ) THEN
    RAISE EXCEPTION 'FULFILLMENT_026_028_REQUIRES_CLASSIFIEDS_MEDIA_CONTRACT';
  END IF;
  IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='product_listings'
        AND column_name IN ('requires_prescription','controlled_item')
    )
    OR to_regclass(current_schema() || '.fulfillment_orders') IS NOT NULL
    OR to_regclass(current_schema() || '.fulfillment_order_items') IS NOT NULL
    OR to_regclass(current_schema() || '.fulfillment_order_events') IS NOT NULL
    OR to_regclass(current_schema() || '.fulfillment_order_ratings') IS NOT NULL
    OR to_regclass(current_schema() || '.fulfillment_order_location_updates') IS NOT NULL
    OR to_regclass(current_schema() || '.mobility_document_reviews') IS NOT NULL
    OR to_regclass(current_schema() || '.mobility_document_review_events') IS NOT NULL
    OR to_regclass(current_schema() || '.platform_notifications') IS NOT NULL
    OR to_regprocedure(current_schema() || '.create_pending_mobility_document_review()') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='media_assets_pending_mobility_document_review')
    OR EXISTS (
      SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname=current_schema() AND t.relname='media_assets'
        AND (c.conname='media_assets_driver_documents_private_check'
          OR (c.conname='media_assets_asset_type_check' AND pg_get_constraintdef(c.oid) LIKE '%driver_photo%'))
    )
  THEN
    RAISE EXCEPTION 'FULFILLMENT_026_028_PARTIAL_OR_UNVERIFIED_STATE';
  END IF;
END
\$guard\$;
\ir ${migration_026}
\ir ${migration_027}
\ir ${migration_028}
COMMIT;
SQL
fi

set +e
state="$(schema_state)"
state_status=$?
set -e
[ "$state_status" -eq 0 ] || exit "$state_status"
[ "$state" = 'verified' ] || exit_for_schema_state "$state"
printf '%s\n' "FULFILLMENT_026_028_APPLIED_AND_VERIFIED:${environment}:${project}"
