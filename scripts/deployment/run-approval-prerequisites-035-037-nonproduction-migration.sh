#!/bin/sh
set -eu

readonly DEFAULT_MIGRATION_035_FILE='/migrations/035_specialized_admin_roles.sql'
readonly DEFAULT_MIGRATION_037_FILE='/migrations/037_verification_evidence_media.sql'
readonly APPROVED_035_SHA256='e21bcbb1da547ca56aa290a1f89023e6c3692d5f1d27e99675e1d481021de693'
readonly APPROVED_037_SHA256='2ff2dbac17a7606ced97cb332c52a431d6eb6ea6b35271906ff9984d14a7b216'
readonly CANONICAL_PRODUCTION_PROJECT='khedma-dl'
readonly EXPECTED_DATABASE_NAME='khedmah'
readonly EXPECTED_DATABASE_USER='khedmah_migrator'

migration_035_file="${SPECIALIZED_ADMIN_MIGRATION_FILE:-$DEFAULT_MIGRATION_035_FILE}"
migration_037_file="${VERIFICATION_EVIDENCE_MIGRATION_FILE:-$DEFAULT_MIGRATION_037_FILE}"
environment="${DEPLOYMENT_ENVIRONMENT:-}"
mode="${MIGRATION_MODE:-verify}"
project="${GOOGLE_CLOUD_PROJECT:-}"
region="${GOOGLE_CLOUD_REGION:-}"
production_project="${PRODUCTION_GOOGLE_CLOUD_PROJECT:-}"
cloud_sql_connection="${CLOUD_SQL_INSTANCE_CONNECTION_NAME:-}"
allow_local_tests="${ALLOW_LOCAL_SCHEMA_TESTS:-false}"

# The replacement Preview remains immutable after its reviewed rollout. Applying
# these successors requires a separately reviewed one-shot path; steady-state
# Preview jobs may only prove the completed state without writing.
if [ "$project" = 'khedmah-preview-v2-20261012' ]; then
  if [ "$environment" != 'preview' ] || [ "$production_project" != 'khedma-dl' ] || [ "$mode" != 'verify' ]; then
    echo 'PREVIEW_V2_SCHEMA_VERIFY_ONLY' >&2
    exit 4
  fi
fi

case "$environment" in preview|staging) ;; *) exit 61 ;; esac
case "$mode" in verify|apply) ;; *) exit 62 ;; esac
case "$allow_local_tests" in true|false) ;; *) exit 62 ;; esac
test -n "$project" || exit 63
test -n "$production_project" || exit 64
if [ "$production_project" != "$CANONICAL_PRODUCTION_PROJECT" ]; then
  echo 'Canonical production project identity is missing or invalid.' >&2
  exit 65
fi
if [ "$project" = "$CANONICAL_PRODUCTION_PROJECT" ] || [ "$project" = "$production_project" ]; then
  echo 'Refusing approval prerequisite migrations 035 and 037 against the production project.' >&2
  exit 65
fi
test -n "${DATABASE_URL:-}" || exit 66
[ "${MIGRATION_035_SHA256:-}" = "$APPROVED_035_SHA256" ] || exit 67
[ "${MIGRATION_037_SHA256:-}" = "$APPROVED_037_SHA256" ] || exit 67
case "$migration_035_file:$migration_037_file" in *..*|*[!A-Za-z0-9_./:-]*) exit 69 ;; esac
if [ "$mode" = 'apply' ]; then
  expected_confirmation="APPLY_KHEDMAH_NONPROD_035_037_$(printf '%s' "$environment" | tr '[:lower:]' '[:upper:]')"
  [ "${MIGRATION_CONFIRMATION:-}" = "$expected_confirmation" ] || exit 68
fi
printf '%s  %s\n' "$APPROVED_035_SHA256" "$migration_035_file" | sha256sum -c - >/dev/null 2>&1 || exit 69
printf '%s  %s\n' "$APPROVED_037_SHA256" "$migration_037_file" | sha256sum -c - >/dev/null 2>&1 || exit 69

# Never inherit alternate libpq routing. Cloud jobs use an explicit, validated
# Unix socket; the only non-Cloud-SQL path is the opt-in disposable SQL test.
unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGPORT 2>/dev/null || true
if [ "$mode" = 'verify' ]; then
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=5000'
else
  PGOPTIONS='-c statement_timeout=120000 -c lock_timeout=5000'
fi
export PGOPTIONS

if [ "$allow_local_tests" = 'true' ]; then
  [ -z "$cloud_sql_connection" ] || exit 52
  command -v python3 >/dev/null 2>&1 || exit 52
  set +e
  connection_exports="$(DATABASE_URL="$DATABASE_URL" python3 - <<'PY'
import os, re, shlex
from urllib.parse import parse_qs, unquote, urlsplit
try:
    parsed = urlsplit(os.environ['DATABASE_URL'])
    query = parse_qs(parsed.query, keep_blank_values=True)
    if parsed.scheme not in ('postgres', 'postgresql') or parsed.hostname is not None or parsed.port is not None:
        raise ValueError('local tests require a hostless URL')
    if set(query) - {'user'} or len(query.get('user', [])) > 1:
        raise ValueError('unsupported local query')
    database = unquote(parsed.path[1:] if parsed.path.startswith('/') else parsed.path)
    user = unquote(parsed.username or (query.get('user') or [''])[0])
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,62}', database):
        raise ValueError('invalid database')
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,62}', user):
        raise ValueError('invalid user')
    if database != 'khedmah' or user != 'khedmah_migrator':
        raise ValueError('unexpected database identity')
    for name, value in {'PGDATABASE': database, 'PGUSER': user, 'PGHOST': '/var/run/postgresql', 'PGPASSWORD': ''}.items():
        print(f'{name}={shlex.quote(value)}')
except Exception:
    raise SystemExit(1)
PY
)"
  parse_status=$?
  set -e
  [ "$parse_status" -eq 0 ] || exit 52
else
  case "$project" in ''|*[!a-z0-9-]*|-*|*-) exit 52 ;; esac
  case "$region" in ''|*[!a-z0-9-]*|-*|*-) exit 52 ;; esac
  expected_prefix="${project}:${region}:"
  case "$cloud_sql_connection" in "$expected_prefix"*) ;; *) exit 52 ;; esac
  instance="${cloud_sql_connection#"$expected_prefix"}"
  case "$instance" in ''|*[!a-z0-9-]*|-*|*-) exit 52 ;; esac
  command -v python3 >/dev/null 2>&1 || exit 52
  set +e
  connection_exports="$(DATABASE_URL="$DATABASE_URL" CLOUD_SQL_SOCKET="/cloudsql/${cloud_sql_connection}" python3 - <<'PY'
import os, re, shlex
from urllib.parse import unquote, urlsplit
try:
    parsed = urlsplit(os.environ['DATABASE_URL'])
    if parsed.scheme not in ('postgres', 'postgresql'):
        raise ValueError('unsupported scheme')
    database = unquote(parsed.path[1:] if parsed.path.startswith('/') else parsed.path)
    user = unquote(parsed.username or '')
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,62}', database):
        raise ValueError('invalid database')
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,62}', user):
        raise ValueError('invalid user')
    if database != 'khedmah' or user != 'khedmah_migrator':
        raise ValueError('unexpected database identity')
    for name, value in {
        'PGDATABASE': database,
        'PGUSER': user,
        'PGPASSWORD': unquote(parsed.password or ''),
        'PGHOST': os.environ['CLOUD_SQL_SOCKET'],
    }.items():
        print(f'{name}={shlex.quote(value)}')
except Exception:
    raise SystemExit(1)
PY
)"
  parse_status=$?
  set -e
  [ "$parse_status" -eq 0 ] || exit 52
fi
eval "$connection_exports"
PGSSLMODE=disable
export PGDATABASE PGUSER PGPASSWORD PGHOST PGSSLMODE

psql_exec() { command psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" "$@"; }
psql_exec -X -Atq -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1 || exit 50
psql_scalar() { psql_exec -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
database_identity="$(psql_scalar "SELECT pg_catalog.current_database() || ':' || current_user || ':' || session_user" 2>/dev/null)" || exit 50
[ "$database_identity" = "${EXPECTED_DATABASE_NAME}:${EXPECTED_DATABASE_USER}:${EXPECTED_DATABASE_USER}" ] || {
  echo 'MIGRATIONS_035_037_DATABASE_IDENTITY_MISMATCH' >&2
  exit 53
}
# Every decision and mutation is made by one catalog snapshot while the
# governed advisory lock and all six relation locks are held. ROW EXCLUSIVE is
# the strongest explicit table lock allowed by PostgreSQL in a read-only
# transaction and conflicts with the trigger/rule DDL governed here; apply
# upgrades only the table changed by the selected migration step.
# The column checks are part of the schema contract: otherwise PostgreSQL
# CHECK's NULL semantics or a missing default could weaken privacy or quotas.
locked_step() {
  if [ "$mode" = 'apply' ]; then
    allow_apply='true'
  else
    allow_apply='false'
  fi
  psql_exec -X -Atq -v ON_ERROR_STOP=1 \
    -v allow_apply="$allow_apply" \
    -v migration_035_file="$migration_035_file" \
    -v migration_037_file="$migration_037_file" <<'SQL'
\if :allow_apply
BEGIN;
\else
BEGIN READ ONLY;
\endif
SET LOCAL lock_timeout=0;
SET LOCAL search_path=pg_catalog,public;
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('khedmah-nonproduction-approval-prerequisites-035-037',0))
\g /dev/null
SELECT pg_catalog.to_regclass('public.admin_roles') IS NOT NULL
   AND pg_catalog.to_regclass('public.ad_free_slots') IS NOT NULL
   AND pg_catalog.to_regclass('public.food_promo_codes') IS NOT NULL
   AND pg_catalog.to_regclass('public.food_promo_claims') IS NOT NULL
   AND pg_catalog.to_regclass('public.media_assets') IS NOT NULL
   AND pg_catalog.to_regclass('public.mobility_document_reviews') IS NOT NULL AS lockable
\gset pre_
\if :pre_lockable
  LOCK TABLE public.admin_roles, public.ad_free_slots, public.media_assets IN ROW EXCLUSIVE MODE;
  LOCK TABLE public.food_promo_codes, public.food_promo_claims,
    public.mobility_document_reviews IN ACCESS SHARE MODE;
WITH attributes AS (
  SELECT a.attrelid,a.attname,a.attnotnull,a.atthasdef,a.attidentity,a.attgenerated,a.attcollation,
    pg_catalog.format_type(a.atttypid,a.atttypmod) AS type_name,
    pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_definition
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attnum>0 AND NOT a.attisdropped
    AND a.attrelid IN (to_regclass('public.admin_roles'),to_regclass('public.ad_free_slots'),to_regclass('public.media_assets'))
), column_state AS (
  SELECT
    (SELECT count(*)=1 FROM attributes WHERE attrelid=to_regclass('public.admin_roles')
      AND attname='role' AND type_name='text' AND attnotnull AND NOT atthasdef
      AND attcollation='pg_catalog."default"'::regcollation
      AND default_definition IS NULL AND attidentity='' AND attgenerated='') AS role_exact,
    (SELECT count(*)=1 FROM attributes WHERE attrelid=to_regclass('public.ad_free_slots')
      AND attname='owner_user_id' AND type_name='text' AND attnotnull AND NOT atthasdef
      AND attcollation='pg_catalog."default"'::regcollation
      AND default_definition IS NULL AND attidentity='' AND attgenerated='')
    AND (SELECT count(*)=1 FROM attributes WHERE attrelid=to_regclass('public.ad_free_slots')
      AND attname='consumed_at' AND type_name='timestamp with time zone' AND attnotnull AND atthasdef
      AND attcollation=0 AND default_definition='now()' AND attidentity='' AND attgenerated='') AS quota_exact,
    (SELECT count(*)=1 FROM attributes WHERE attrelid=to_regclass('public.media_assets')
      AND attname='asset_type' AND type_name='text' AND NOT attnotnull AND NOT atthasdef
      AND attcollation='pg_catalog."default"'::regcollation
      AND default_definition IS NULL AND attidentity='' AND attgenerated='')
    AND (SELECT count(*)=1 FROM attributes WHERE attrelid=to_regclass('public.media_assets')
      AND attname='owner_type' AND type_name='text' AND attnotnull AND NOT atthasdef
      AND attcollation='pg_catalog."default"'::regcollation
      AND default_definition IS NULL AND attidentity='' AND attgenerated='')
    AND (SELECT count(*)=1 FROM attributes WHERE attrelid=to_regclass('public.media_assets')
      AND attname='visibility' AND type_name='text' AND attnotnull AND atthasdef
      AND attcollation='pg_catalog."default"'::regcollation
      AND default_definition='''private''::text' AND attidentity='' AND attgenerated='') AS media_exact
), constraints AS (
  SELECT c.*,
    pg_catalog.pg_get_constraintdef(c.oid) AS definition,
    (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
     FROM unnest(c.conkey) AS key(attnum)
     JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=key.attnum AND NOT a.attisdropped) AS columns,
    (SELECT bool_and(pg_catalog.format_type(a.atttypid,a.atttypmod)='text')
     FROM unnest(c.conkey) AS key(attnum)
     JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=key.attnum AND NOT a.attisdropped) AS text_columns
  FROM pg_constraint c
  WHERE (c.conrelid=to_regclass('public.admin_roles') AND c.conname='admin_roles_role_check')
     OR (c.conrelid=to_regclass('public.media_assets')
         AND c.conname IN ('media_assets_asset_type_check','media_assets_verification_evidence_private_check'))
), role_state AS (
  SELECT count(*)=1
      AND count(*) FILTER (WHERE contype='c' AND convalidated AND NOT condeferrable AND NOT condeferred
        AND conislocal AND coninhcount=0 AND NOT connoinherit
        AND columns=ARRAY['role']::text[] AND text_columns
        AND definition=$expected$CHECK ((role = ANY (ARRAY['bootstrap_admin'::text, 'platform_admin'::text, 'moderator'::text, 'billing_admin'::text])))$expected$)=1 AS predecessor,
    count(*)=1
      AND count(*) FILTER (WHERE contype='c' AND convalidated AND NOT condeferrable AND NOT condeferred
        AND conislocal AND coninhcount=0 AND NOT connoinherit
        AND columns=ARRAY['role']::text[] AND text_columns
        AND definition=$expected$CHECK ((role = ANY (ARRAY['bootstrap_admin'::text, 'platform_admin'::text, 'moderator'::text, 'billing_admin'::text, 'taxi_pricing_admin'::text, 'category_admin'::text])))$expected$)=1 AS target
  FROM constraints WHERE conrelid=to_regclass('public.admin_roles') AND conname='admin_roles_role_check'
), asset_state AS (
  SELECT count(*)=1
      AND count(*) FILTER (WHERE contype='c' AND convalidated AND NOT condeferrable AND NOT condeferred
        AND conislocal AND coninhcount=0 AND NOT connoinherit
        AND columns=ARRAY['asset_type']::text[] AND text_columns
        AND definition=$expected$CHECK ((asset_type = ANY (ARRAY['logo'::text, 'cover'::text, 'gallery'::text, 'profile_image'::text, 'service_image'::text, 'product_image'::text, 'ad_image'::text, 'driver_photo'::text, 'identity_card'::text, 'driving_license'::text, 'vehicle_license'::text])))$expected$)=1 AS predecessor,
    count(*)=1
      AND count(*) FILTER (WHERE contype='c' AND convalidated AND NOT condeferrable AND NOT condeferred
        AND conislocal AND coninhcount=0 AND NOT connoinherit
        AND columns=ARRAY['asset_type']::text[] AND text_columns
        AND definition=$expected$CHECK ((asset_type = ANY (ARRAY['logo'::text, 'cover'::text, 'gallery'::text, 'profile_image'::text, 'service_image'::text, 'product_image'::text, 'ad_image'::text, 'driver_photo'::text, 'identity_card'::text, 'driving_license'::text, 'vehicle_license'::text, 'business_verification_evidence'::text, 'professional_verification_evidence'::text])))$expected$)=1 AS target
  FROM constraints WHERE conrelid=to_regclass('public.media_assets') AND conname='media_assets_asset_type_check'
), private_state AS (
  SELECT count(*)=0 AS absent,
    count(*)=1
      AND count(*) FILTER (WHERE contype='c' AND convalidated AND NOT condeferrable AND NOT condeferred
        AND conislocal AND coninhcount=0 AND NOT connoinherit
        AND columns=ARRAY['asset_type','owner_type','visibility']::text[] AND text_columns
        AND definition=$expected$CHECK (((asset_type IS NULL) OR ((asset_type = 'business_verification_evidence'::text) AND (owner_type = 'business_profile'::text) AND (visibility = 'private'::text)) OR ((asset_type = 'professional_verification_evidence'::text) AND (owner_type = 'professional_profile'::text) AND (visibility = 'private'::text)) OR (asset_type <> ALL (ARRAY['business_verification_evidence'::text, 'professional_verification_evidence'::text]))))$expected$)=1 AS target
  FROM constraints WHERE conrelid=to_regclass('public.media_assets') AND conname='media_assets_verification_evidence_private_check'
), quota_state AS (
  SELECT ((SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND p.proname='enforce_ad_free_slot_limit'
      AND pg_get_function_identity_arguments(p.oid)=''
      AND p.prokind='f' AND l.lanname='plpgsql' AND p.provolatile='v' AND p.proparallel='u'
      AND NOT p.proisstrict AND NOT p.proleakproof AND p.pronargdefaults=0 AND p.provariadic=0
      AND p.prosecdef=false AND p.proconfig IS NULL AND p.proretset=false
      AND p.prorettype='pg_catalog.trigger'::regtype
      AND pg_get_userbyid(p.proowner)='khedmah_migrator'
      AND p.prosrc=$quota$
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
END $quota$)=1
  AND (SELECT count(*) FROM pg_trigger t
    WHERE t.tgrelid=to_regclass('public.ad_free_slots')
      AND t.tgname='ad_free_slot_limit_before_insert'
      AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=7 AND t.tgnargs=0
      AND t.tgfoid=to_regprocedure('public.enforce_ad_free_slot_limit()')
      AND t.tgconstraint=0 AND NOT t.tgdeferrable AND NOT t.tginitdeferred
      AND t.tgattr=''::int2vector AND t.tgqual IS NULL
      AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL AND t.tgparentid=0)=1
  AND (SELECT count(*) FROM pg_trigger t
    WHERE t.tgrelid=to_regclass('public.ad_free_slots')
      AND NOT t.tgisinternal AND (t.tgtype::integer & 4)=4)=1
  AND (SELECT count(*) FROM pg_rewrite r
    WHERE r.ev_class=to_regclass('public.ad_free_slots') AND r.ev_type='3')=0) AS target
), object_state AS (
  SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
      AND c.relname IN ('admin_roles','ad_free_slots','food_promo_codes','food_promo_claims','media_assets','mobility_document_reviews'))=6 AS target
), state AS (
  SELECT CASE
    WHEN NOT object_state.target OR NOT column_state.quota_exact OR NOT quota_state.target THEN 'prerequisite-invalid'
    WHEN NOT column_state.role_exact OR NOT column_state.media_exact THEN 'invalid'
    WHEN role_state.predecessor AND asset_state.predecessor AND private_state.absent THEN 'predecessor'
    WHEN role_state.target AND asset_state.predecessor AND private_state.absent THEN 'role-target'
    WHEN role_state.target AND asset_state.target AND private_state.target THEN 'target'
    ELSE 'invalid'
  END AS classification
  FROM column_state,role_state,asset_state,private_state,quota_state,object_state
)
SELECT classification='prerequisite-invalid' AS prerequisite_invalid,
       classification='invalid' AS invalid,
       classification='predecessor' AS predecessor,
       classification='role-target' AS role_target,
       classification='target' AS target
FROM state
\gset step_
\if :step_target
  ROLLBACK;
  \echo STEP_TARGET
\elif :step_prerequisite_invalid
  ROLLBACK;
  \echo STEP_PREREQUISITE_INVALID
\elif :step_invalid
  ROLLBACK;
  \echo STEP_INVALID
\elif :step_predecessor
  \if :allow_apply
    LOCK TABLE public.admin_roles IN ACCESS EXCLUSIVE MODE;
    \ir :migration_035_file
    \echo MIGRATION_035_APPLIED_AFTER_LOCK
  \else
    ROLLBACK;
    \echo STEP_PREDECESSOR
  \endif
\elif :step_role_target
  \if :allow_apply
    LOCK TABLE public.media_assets IN ACCESS EXCLUSIVE MODE;
    \ir :migration_037_file
    COMMIT;
    \echo MIGRATION_037_APPLIED_AFTER_LOCK
  \else
    ROLLBACK;
    \echo STEP_ROLE_TARGET
  \endif
\else
  ROLLBACK;
  \echo STEP_INVALID
\endif
\else
  ROLLBACK;
  \echo STEP_PREREQUISITE_INVALID
\endif
SQL
}

applied_any='false'
step=0
while [ "$step" -lt 4 ]; do
  if ! step_output="$(locked_step)"; then
    echo 'MIGRATIONS_035_037_PARTIAL_OR_UNVERIFIED_STATE' >&2
    exit 44
  fi
  case "$step_output" in
    *STEP_PREREQUISITE_INVALID*)
      echo 'MIGRATIONS_035_037_REQUIRE_CANONICAL_034_036' >&2
      exit 41
      ;;
    *STEP_INVALID*)
      echo 'MIGRATIONS_035_037_PARTIAL_OR_UNVERIFIED_STATE' >&2
      exit 43
      ;;
    *STEP_TARGET*)
      if [ "$applied_any" = 'true' ]; then
        printf '%s\n' "MIGRATIONS_035_037_APPLIED_AND_VERIFIED:${environment}:${project}"
      else
        printf '%s\n' "MIGRATIONS_035_037_ALREADY_APPLIED_AND_VERIFIED:${environment}:${project}"
      fi
      exit 0
      ;;
    *STEP_PREDECESSOR*|*STEP_ROLE_TARGET*)
      exit 42
      ;;
    *MIGRATION_035_APPLIED_AFTER_LOCK*)
      printf '%s\n' "$step_output"
      applied_any='true'
      ;;
    *MIGRATION_037_APPLIED_AFTER_LOCK*)
      printf '%s\n' "$step_output"
      applied_any='true'
      ;;
    *)
      echo 'MIGRATIONS_035_037_PARTIAL_OR_UNVERIFIED_STATE' >&2
      exit 44
      ;;
  esac
  step=$((step + 1))
done

echo 'MIGRATIONS_035_037_CONCURRENT_STATE_DID_NOT_CONVERGE' >&2
exit 44
