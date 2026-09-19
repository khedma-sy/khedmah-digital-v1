#!/bin/sh
set -eu

environment="${DEPLOYMENT_ENVIRONMENT:-}"
project="${GOOGLE_CLOUD_PROJECT:-}"
production_project="${PRODUCTION_GOOGLE_CLOUD_PROJECT:-}"
readonly EXPECTED_MIGRATIONS='
001_core_identity_accounts
002_create_profiles
003_create_professional_profiles
004_analytics_and_contact
005_email_verifications_and_admin_roles
006_media_assets
007_v2_marketplace
008_provider_service_radius
009_canonical_identity_runtime
010_canonical_runtime_domains
011_canonical_media_contract
012_nearby_preferences
013_nearby_notifications_read_state
014_supplier_discovery
015_contact_target_contract
016_contact_submission_idempotency
017_category_taxonomy_contract
018_persistent_rate_limit_buckets
019_remove_out_of_scope_subscription_schema
020_identity_recovery_oauth
021_provider_reports
022_expand_category_taxonomy
'

case "$environment" in
  preview|staging) ;;
  *) echo 'ERROR: foundation 001-022 is allowed only in preview or staging.' >&2; exit 2 ;;
esac

test -n "$project" || { echo 'ERROR: GOOGLE_CLOUD_PROJECT is required.' >&2; exit 2; }
test -n "$production_project" || { echo 'ERROR: PRODUCTION_GOOGLE_CLOUD_PROJECT is required.' >&2; exit 2; }
[ "$project" != "$production_project" ] || { echo 'ERROR: Refusing foundation 001-022 against Production.' >&2; exit 3; }
test -n "${DATABASE_URL:-}" || { echo 'ERROR: DATABASE_URL is required.' >&2; exit 2; }
printf '%s' "${FOUNDATION_MANIFEST_SHA256:-}" | grep -Eq '^[0-9a-f]{64}$' || {
  echo 'ERROR: FOUNDATION_MANIFEST_SHA256 must be a lowercase SHA-256.' >&2
  exit 3
}

files=''
for migration in $EXPECTED_MIGRATIONS; do
  file="/migrations/${migration}.sql"
  test -r "$file" || { echo "ERROR: Missing foundation migration $file" >&2; exit 3; }
  files="$files $file"
done
actual_manifest_sha="$(cat $files | sha256sum | awk '{print $1}')"
[ "$actual_manifest_sha" = "$FOUNDATION_MANIFEST_SHA256" ] || {
  echo 'ERROR: foundation 001-022 manifest checksum mismatch.' >&2
  exit 3
}

if [ -n "${CLOUD_SQL_INSTANCE_CONNECTION_NAME:-}" ]; then
  command -v python3 >/dev/null 2>&1 || exit 52
  set +e
  connection_exports="$(DATABASE_URL="$DATABASE_URL" python3 - <<'PY'
import os
import shlex
from urllib.parse import unquote, urlsplit
try:
    parsed = urlsplit(os.environ['DATABASE_URL'])
    if parsed.scheme not in ('postgres', 'postgresql'):
        raise ValueError('unsupported database URL scheme')
    database = unquote(parsed.path[1:] if parsed.path.startswith('/') else parsed.path)
    if not database:
        raise ValueError('database name is required')
    for name, value in {
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
psql_scalar() {
  psql_exec -X -Atq -v ON_ERROR_STOP=1 -c "$1"
}

psql_exec -X -Atq -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1 || exit 50

baseline_count="$(psql_scalar "
SELECT
  (to_regclass(current_schema() || '.core_user_accounts') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.profiles') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.professional_profiles') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.business_profiles') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.locations') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.organizations') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.roles') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.permissions') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.media_assets') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.identity_sessions') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.nearby_preferences') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.nearby_notifications') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.supplier_capabilities') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.contact_submission_idempotency') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.categories') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.rate_limit_buckets') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.password_reset_tokens') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.external_identities') IS NOT NULL)::int
")" || exit 49

known_count="$(psql_scalar "
SELECT count(*)::int
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname=current_schema()
  AND c.relkind IN ('r','p')
  AND c.relname IN (
    'core_user_accounts','profiles','professional_profiles','contact_inquiries',
    'identity_sessions','business_profiles','locations','organizations','roles',
    'permissions','media_assets','nearby_preferences','nearby_notifications',
    'supplier_capabilities','contact_submission_idempotency','categories',
    'rate_limit_buckets','password_reset_tokens','external_identities',
    'provider_reports','product_listings','ad_listings','fulfillment_orders',
    'billing_program_config','taxi_pricing_revisions','food_promo_codes'
  )
")" || exit 49

provider_reports="$(psql_scalar "SELECT (to_regclass(current_schema() || '.provider_reports') IS NOT NULL)::int")" || exit 49
taxonomy_022="$(psql_scalar "SELECT (to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NOT NULL)::int")" || exit 49

if [ "$baseline_count" -eq 0 ] && [ "$known_count" -eq 0 ]; then
  state='fresh'
elif [ "$baseline_count" -eq 18 ]; then
  if [ "$taxonomy_022" -eq 1 ] && [ "$provider_reports" -ne 1 ]; then
    echo 'FOUNDATION_001_022_PARTIAL:taxonomy_without_021' >&2
    exit 43
  fi
  if [ "$provider_reports" -eq 0 ]; then
    state='baseline_001_020'
  elif [ "$taxonomy_022" -eq 0 ]; then
    state='through_021'
  else
    state='through_022'
  fi
else
  echo "FOUNDATION_001_022_PARTIAL:baseline_count=${baseline_count}:known_count=${known_count}" >&2
  exit 43
fi

if [ "$state" = 'through_022' ]; then
  echo "FOUNDATION_001_022_ALREADY_APPLIED_AND_VERIFIED:${environment}:${project}"
  exit 0
fi

if [ "$state" = 'fresh' ]; then
  psql_exec -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-foundation-001-022', 0));
\ir /migrations/001_core_identity_accounts.sql
\ir /migrations/002_create_profiles.sql
\ir /migrations/003_create_professional_profiles.sql
\ir /migrations/004_analytics_and_contact.sql
\ir /migrations/005_email_verifications_and_admin_roles.sql
\ir /migrations/006_media_assets.sql
\ir /migrations/007_v2_marketplace.sql
\ir /migrations/008_provider_service_radius.sql
\ir /migrations/009_canonical_identity_runtime.sql
\ir /migrations/010_canonical_runtime_domains.sql
\ir /migrations/011_canonical_media_contract.sql
\ir /migrations/012_nearby_preferences.sql
\ir /migrations/013_nearby_notifications_read_state.sql
\ir /migrations/014_supplier_discovery.sql
\ir /migrations/015_contact_target_contract.sql
\ir /migrations/016_contact_submission_idempotency.sql
\ir /migrations/017_category_taxonomy_contract.sql
\ir /migrations/018_persistent_rate_limit_buckets.sql
\ir /migrations/019_remove_out_of_scope_subscription_schema.sql
\ir /migrations/020_identity_recovery_oauth.sql
\ir /migrations/021_provider_reports.sql
\ir /migrations/022_expand_category_taxonomy.sql
COMMIT;
SQL
elif [ "$state" = 'baseline_001_020' ]; then
  psql_exec -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-foundation-001-022', 0));
\ir /migrations/021_provider_reports.sql
\ir /migrations/022_expand_category_taxonomy.sql
COMMIT;
SQL
elif [ "$state" = 'through_021' ]; then
  psql_exec -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-foundation-001-022', 0));
\ir /migrations/022_expand_category_taxonomy.sql
COMMIT;
SQL
else
  echo "FOUNDATION_001_022_UNKNOWN_STATE:$state" >&2
  exit 48
fi

verify_count="$(psql_scalar "
SELECT
  (to_regclass(current_schema() || '.core_user_accounts') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.media_assets') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.categories') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.external_identities') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.provider_reports') IS NOT NULL)::int +
  (to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NOT NULL)::int
")" || exit 49
[ "$verify_count" -eq 6 ] || { echo "FOUNDATION_001_022_POSTCONDITION_FAILED:$verify_count" >&2; exit 47; }

column_count="$(psql_scalar "
SELECT count(*)::int FROM information_schema.columns
WHERE table_schema=current_schema()
  AND table_name='categories'
  AND column_name IN ('parent_code','visual_key','search_aliases_ar','search_aliases_en','is_featured')
")" || exit 49
[ "$column_count" -eq 5 ] || { echo "FOUNDATION_001_022_CATEGORY_POSTCONDITION_FAILED:$column_count" >&2; exit 47; }

echo "FOUNDATION_001_022_APPLIED_AND_VERIFIED:${environment}:${project}"
