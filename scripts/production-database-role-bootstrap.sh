#!/bin/sh
set -eu

PHASE="${DATABASE_ROLE_PHASE:-}"
RUNTIME_USER="${DATABASE_RUNTIME_USER:-khedmah_app}"
MIGRATION_USER="${DATABASE_MIGRATION_USER:-khedmah_migrator}"
RUNTIME_ROLE="${DATABASE_RUNTIME_ROLE:-khedmah_runtime_role}"
MIGRATION_ROLE="${DATABASE_MIGRATION_ROLE:-khedmah_migration_role}"
DATABASE_NAME="${DATABASE_NAME:-khedmah}"

is_postgres_identifier() {
  case "$1" in
    ''|[0-9]*|*[!A-Za-z0-9_]*) return 1 ;;
  esac
  test "${#1}" -le 63
}

is_managed_hex_password() {
  test "${#1}" -eq 64 || return 1
  case "$1" in
    *[!0-9a-f]*) return 1 ;;
  esac
}

is_tcp_port() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
  esac
  test "${#1}" -le 5 || return 1
  test "$1" -ge 1 && test "$1" -le 65535
}

is_cloud_sql_connection_name() {
  connection_name="$1"
  case "$connection_name" in
    ''|*[!a-z0-9:-]*) return 1 ;;
  esac
  connection_project="${connection_name%%:*}"
  connection_remainder="${connection_name#*:}"
  test "$connection_remainder" != "$connection_name" || return 1
  connection_region="${connection_remainder%%:*}"
  connection_instance="${connection_remainder#*:}"
  test "$connection_instance" != "$connection_remainder" || return 1
  case "$connection_instance" in *:*) return 1 ;; esac
  for connection_component in "$connection_project" "$connection_region" "$connection_instance"; do
    case "$connection_component" in
      ''|-*|*[!a-z0-9-]*) return 1 ;;
    esac
  done
}

test -n "${DATABASE_URL:-}" || { echo 'ERROR: DATABASE_URL is required.' >&2; exit 2; }

PSQL_DATABASE_URL="$DATABASE_URL"
if ! test -n "${CLOUD_SQL_INSTANCE_CONNECTION_NAME:-}"; then
  case "${CI:-}:${ALLOW_DESTRUCTIVE_DB_TESTS:-}:$DATABASE_NAME" in
    true:true:*_ci|true:true:*_test) ;;
    *)
      echo 'ERROR: CLOUD_SQL_INSTANCE_CONNECTION_NAME is required for Production database operations.' >&2
      exit 2
      ;;
  esac

  case "$DATABASE_URL" in
    postgres://*) CI_DATABASE_URI_REST="${DATABASE_URL#postgres://}" ;;
    postgresql://*) CI_DATABASE_URI_REST="${DATABASE_URL#postgresql://}" ;;
    *) echo 'ERROR: CI DATABASE_URL must be a PostgreSQL URI.' >&2; exit 2 ;;
  esac
  CI_DATABASE_CREDENTIALS="${CI_DATABASE_URI_REST%%@*}"
  CI_DATABASE_HOST_AND_PATH="${CI_DATABASE_URI_REST#*@}"
  test "$CI_DATABASE_HOST_AND_PATH" != "$CI_DATABASE_URI_REST" || {
    echo 'ERROR: CI DATABASE_URL credentials are malformed.' >&2
    exit 2
  }
  case "$CI_DATABASE_CREDENTIALS" in
    ''|*'@'*|*'/'*|*'?'*|*'#'*) echo 'ERROR: CI DATABASE_URL credentials are malformed.' >&2; exit 2 ;;
  esac
  CI_DATABASE_USER="${CI_DATABASE_CREDENTIALS%%:*}"
  CI_DATABASE_PASSWORD="${CI_DATABASE_CREDENTIALS#*:}"
  test "$CI_DATABASE_PASSWORD" != "$CI_DATABASE_CREDENTIALS" || {
    echo 'ERROR: CI DATABASE_URL credentials are malformed.' >&2
    exit 2
  }
  test "$CI_DATABASE_USER" = "$MIGRATION_USER" || {
    echo 'ERROR: CI DATABASE_URL user does not match DATABASE_MIGRATION_USER.' >&2
    exit 2
  }
  is_managed_hex_password "$CI_DATABASE_PASSWORD" || {
    echo 'ERROR: CI DATABASE_URL password must use the managed 256-bit hexadecimal format.' >&2
    exit 2
  }
  CI_DATABASE_AUTHORITY="${CI_DATABASE_HOST_AND_PATH%%/*}"
  CI_DATABASE_NAME_FROM_URL="${CI_DATABASE_HOST_AND_PATH#*/}"
  test "$CI_DATABASE_NAME_FROM_URL" != "$CI_DATABASE_HOST_AND_PATH" || {
    echo 'ERROR: CI DATABASE_URL database is malformed.' >&2
    exit 2
  }
  test "$CI_DATABASE_NAME_FROM_URL" = "$DATABASE_NAME" || {
    echo 'ERROR: CI DATABASE_URL database does not match DATABASE_NAME.' >&2
    exit 2
  }
  case "$CI_DATABASE_AUTHORITY" in
    127.0.0.1|localhost|'[::1]') ;;
    127.0.0.1:*|localhost:*|'[::1]':*)
      CI_DATABASE_PORT="${CI_DATABASE_AUTHORITY##*:}"
      is_tcp_port "$CI_DATABASE_PORT" || {
        echo 'ERROR: CI DATABASE_URL port is malformed.' >&2
        exit 2
      }
      ;;
    *) echo 'ERROR: CI DATABASE_URL must use a loopback authority.' >&2; exit 2 ;;
  esac
  unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
else
  is_cloud_sql_connection_name "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" || {
      echo 'ERROR: invalid Cloud SQL instance connection name.' >&2
      exit 2
    }
  case "$DATABASE_URL" in
    postgres://*) DATABASE_URI_SCHEME='postgres'; DATABASE_URI_REST="${DATABASE_URL#postgres://}" ;;
    postgresql://*) DATABASE_URI_SCHEME='postgresql'; DATABASE_URI_REST="${DATABASE_URL#postgresql://}" ;;
    *) echo 'ERROR: DATABASE_URL must be a PostgreSQL URI.' >&2; exit 2 ;;
  esac
  case "$DATABASE_URI_REST" in
    *@localhost/*) ;;
    *) echo 'ERROR: Cloud SQL DATABASE_URL must use the approved localhost authority.' >&2; exit 2 ;;
  esac
  DATABASE_CREDENTIALS="${DATABASE_URI_REST%%@localhost/*}"
  DATABASE_NAME_FROM_URL="${DATABASE_URI_REST##*@localhost/}"
  case "$DATABASE_CREDENTIALS" in
    ''|*'@'*|*'/'*|*'?'*|*'#'*) echo 'ERROR: Cloud SQL DATABASE_URL credentials are malformed.' >&2; exit 2 ;;
  esac
  DATABASE_USER_FROM_URL="${DATABASE_CREDENTIALS%%:*}"
  DATABASE_PASSWORD_FROM_URL="${DATABASE_CREDENTIALS#*:}"
  test "$DATABASE_PASSWORD_FROM_URL" != "$DATABASE_CREDENTIALS" || {
    echo 'ERROR: Cloud SQL DATABASE_URL credentials are malformed.' >&2
    exit 2
  }
  is_postgres_identifier "$DATABASE_USER_FROM_URL" || {
    echo 'ERROR: Cloud SQL DATABASE_URL user is malformed.' >&2
    exit 2
  }
  is_managed_hex_password "$DATABASE_PASSWORD_FROM_URL" || {
    echo 'ERROR: Cloud SQL DATABASE_URL password must use the managed 256-bit hexadecimal format.' >&2
    exit 2
  }
  is_postgres_identifier "$DATABASE_NAME_FROM_URL" || {
    echo 'ERROR: Cloud SQL DATABASE_URL database is malformed.' >&2
    exit 2
  }
  test "$DATABASE_USER_FROM_URL" = "$MIGRATION_USER" || {
    echo 'ERROR: Cloud SQL DATABASE_URL user does not match DATABASE_MIGRATION_USER.' >&2
    exit 2
  }
  test "$DATABASE_NAME_FROM_URL" = "$DATABASE_NAME" || {
    echo 'ERROR: Cloud SQL DATABASE_URL database does not match DATABASE_NAME.' >&2
    exit 2
  }
  PSQL_DATABASE_URL="${DATABASE_URI_SCHEME}://${DATABASE_CREDENTIALS}@/${DATABASE_NAME_FROM_URL}"
  PGHOST="/cloudsql/$CLOUD_SQL_INSTANCE_CONNECTION_NAME"
  PGPORT=5432
  PGSSLMODE=disable
  unset PGHOSTADDR PGSERVICE PGSERVICEFILE
  export PGHOST PGPORT PGSSLMODE
fi

# Resolve every unqualified built-in against the trusted system catalog. Do
# not inherit libpq session options from the image or job environment: the
# bootstrap must begin in the trusted catalog regardless of ambient settings.
PGOPTIONS='-c role=none -c search_path=pg_catalog'
export PGOPTIONS

for identifier in "$RUNTIME_USER" "$MIGRATION_USER" "$RUNTIME_ROLE" "$MIGRATION_ROLE" "$DATABASE_NAME"; do
  is_postgres_identifier "$identifier" || {
    echo "ERROR: invalid PostgreSQL identifier." >&2
    exit 2
  }
done

test "$RUNTIME_USER" != "$MIGRATION_USER" \
  && test "$RUNTIME_USER" != "$RUNTIME_ROLE" \
  && test "$RUNTIME_USER" != "$MIGRATION_ROLE" \
  && test "$MIGRATION_USER" != "$RUNTIME_ROLE" \
  && test "$MIGRATION_USER" != "$MIGRATION_ROLE" \
  && test "$RUNTIME_ROLE" != "$MIGRATION_ROLE" || {
  echo 'ERROR: database login users and privilege roles must all be distinct.' >&2
  exit 2
}

case "$PHASE" in
  probe|inventory|prepare|cutover-audit|verify|harden|verify-hardened) ;;
  *)
    echo 'ERROR: DATABASE_ROLE_PHASE must be probe, inventory, prepare, cutover-audit, verify, harden, or verify-hardened.' >&2
    exit 2
    ;;
esac

connection_state="$(psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
SELECT CASE WHEN
  current_setting('server_version_num')::integer >= 160000
  AND current_user = '$MIGRATION_USER'
  AND session_user = '$MIGRATION_USER'
  AND current_database() = '$DATABASE_NAME'
THEN 'ready' ELSE 'blocked' END")"
test "$connection_state" = ready || {
  echo 'ERROR: DATABASE_ROLE_CONNECTION_IDENTITY_NOT_READY' >&2
  exit 6
}

if test "$PHASE" = probe; then
  echo 'DATABASE_MIGRATION_CREDENTIAL_VERIFIED'
  exit 0
fi

compute_system_role_manifest_sha256() {
  system_role_manifest="$(psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
WITH application_role(rolname) AS (
  VALUES
    ('$RUNTIME_USER'),
    ('$MIGRATION_USER'),
    ('$RUNTIME_ROLE'),
    ('$MIGRATION_ROLE')
), manifest(line) AS (
  SELECT concat_ws(
    '|', 'R', role.oid::text,
    encode(convert_to(role.rolname, 'UTF8'), 'hex'),
    role.rolsuper::integer::text,
    role.rolinherit::integer::text,
    role.rolcreaterole::integer::text,
    role.rolcreatedb::integer::text,
    role.rolcanlogin::integer::text,
    role.rolreplication::integer::text,
    role.rolconnlimit::text,
    COALESCE(extract(epoch FROM role.rolvaliduntil)::text, '-'),
    role.rolbypassrls::integer::text,
    encode(convert_to(COALESCE(array_to_string(role.rolconfig, chr(31)), ''), 'UTF8'), 'hex')
  )
  FROM pg_roles role
  WHERE NOT EXISTS (
    SELECT 1 FROM application_role expected WHERE expected.rolname=role.rolname
  )
  UNION ALL
  SELECT concat_ws(
    '|', 'M',
    encode(convert_to(granted_role.rolname, 'UTF8'), 'hex'),
    encode(convert_to(member_role.rolname, 'UTF8'), 'hex'),
    encode(convert_to(grantor_role.rolname, 'UTF8'), 'hex'),
    membership.admin_option::integer::text,
    membership.inherit_option::integer::text,
    membership.set_option::integer::text
  )
  FROM pg_auth_members membership
  JOIN pg_roles granted_role ON granted_role.oid=membership.roleid
  JOIN pg_roles member_role ON member_role.oid=membership.member
  JOIN pg_roles grantor_role ON grantor_role.oid=membership.grantor
  WHERE NOT EXISTS (
    SELECT 1 FROM application_role expected
    WHERE expected.rolname IN (granted_role.rolname, member_role.rolname)
  )
  UNION ALL
  SELECT concat_ws(
    '|', 'S',
    COALESCE(encode(convert_to(configured_role.rolname, 'UTF8'), 'hex'), '0'),
    settings.setdatabase::text,
    encode(convert_to(array_to_string(settings.setconfig, chr(31)), 'UTF8'), 'hex')
  )
  FROM pg_db_role_setting settings
  LEFT JOIN pg_roles configured_role ON configured_role.oid=settings.setrole
  WHERE settings.setrole=0 OR NOT EXISTS (
    SELECT 1 FROM application_role expected WHERE expected.rolname=configured_role.rolname
  )
  UNION ALL
  SELECT concat_ws(
    '|', 'D', database.oid::text,
    encode(convert_to(database.datname, 'UTF8'), 'hex'),
    encode(convert_to(owner_role.rolname, 'UTF8'), 'hex'),
    database.encoding::text,
    encode(convert_to(database.datcollate, 'UTF8'), 'hex'),
    encode(convert_to(database.datctype, 'UTF8'), 'hex'),
    database.datistemplate::integer::text,
    database.datallowconn::integer::text,
    database.datconnlimit::text,
    encode(convert_to(tablespace.spcname, 'UTF8'), 'hex'),
    CASE
      WHEN database.datname='$DATABASE_NAME' THEN '-'
      ELSE encode(
        convert_to(COALESCE(array_to_string(database.datacl, chr(31)), ''), 'UTF8'),
        'hex'
      )
    END
  )
  FROM pg_database database
  JOIN pg_roles owner_role ON owner_role.oid=database.datdba
  JOIN pg_tablespace tablespace ON tablespace.oid=database.dattablespace
)
SELECT line FROM manifest ORDER BY line")"
  if test "${EMIT_SYSTEM_ROLE_MANIFEST:-false}" = true; then
    printf '%s\n' "$system_role_manifest" | while IFS= read -r manifest_line; do
      printf 'DATABASE_SYSTEM_ROLE_MANIFEST_RECORD=%s\n' "$manifest_line" >&2
    done
  fi
  printf '%s\n' "$system_role_manifest" | sha256sum | awk '{print $1}'
}

if test "$PHASE" = inventory; then
  EMIT_SYSTEM_ROLE_MANIFEST=true
  actual_system_role_manifest_sha256="$(compute_system_role_manifest_sha256)"
  printf 'DATABASE_SYSTEM_ROLE_MANIFEST_SHA256=%s\n' "$actual_system_role_manifest_sha256"
  exit 0
fi

is_managed_hex_password "${DATABASE_SYSTEM_ROLE_MANIFEST_SHA256:-}" || {
  echo 'ERROR: DATABASE_SYSTEM_ROLE_MANIFEST_SHA256 must be a lowercase SHA-256.' >&2
  exit 11
}
# During cutover, containment must happen before an untrusted catalog can block
# progress. That phase validates the expected digest immediately after killing
# every legacy privileged application session. All other phases fail before
# mutation when the trusted system-role manifest drifts.
if test "$PHASE" != cutover-audit; then
  actual_system_role_manifest_sha256="$(compute_system_role_manifest_sha256)"
  test "$actual_system_role_manifest_sha256" = "$DATABASE_SYSTEM_ROLE_MANIFEST_SHA256" || {
    echo 'ERROR: DATABASE_SYSTEM_ROLE_MANIFEST_MISMATCH' >&2
    exit 11
  }
fi

global_persistence_safe_sql="
  NOT EXISTS (
    SELECT 1
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid=routine.pronamespace
    JOIN pg_roles owner_role ON owner_role.oid=routine.proowner
    JOIN pg_language language ON language.oid=routine.prolang
    WHERE namespace.nspname !~ '^pg_'
      AND namespace.nspname <> 'information_schema'
      AND routine.prosecdef
      AND NOT (
        routine.oid IS NOT DISTINCT FROM to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)')
        AND owner_role.rolname='$MIGRATION_USER'
        AND language.lanname='plpgsql'
        AND routine.prokind='f'
        AND routine.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']::text[]
      )
  )
  AND current_setting('max_prepared_transactions')::integer=0
  AND NOT EXISTS (SELECT 1 FROM pg_foreign_server)
  AND NOT EXISTS (SELECT 1 FROM pg_foreign_data_wrapper)
  AND NOT EXISTS (SELECT 1 FROM pg_user_mappings)
  AND NOT EXISTS (SELECT 1 FROM pg_event_trigger)
  AND NOT EXISTS (SELECT 1 FROM pg_publication)
  AND NOT EXISTS (SELECT 1 FROM pg_subscription)
  AND NOT EXISTS (SELECT 1 FROM pg_prepared_xacts)
  AND NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql')
  AND NOT EXISTS (SELECT 1 FROM pg_cast WHERE oid >= 16384)
  AND NOT EXISTS (
    SELECT 1 FROM pg_language
    WHERE lanname NOT IN ('internal','c','sql','plpgsql')
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_operator operator
    JOIN pg_namespace namespace ON namespace.oid=operator.oprnamespace
    WHERE namespace.nspname !~ '^pg_'
      AND namespace.nspname <> 'information_schema'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_collation collation
    JOIN pg_namespace namespace ON namespace.oid=collation.collnamespace
    WHERE namespace.nspname !~ '^pg_'
      AND namespace.nspname <> 'information_schema'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_conversion conversion
    JOIN pg_namespace namespace ON namespace.oid=conversion.connamespace
    WHERE namespace.nspname !~ '^pg_'
      AND namespace.nspname <> 'information_schema'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_ts_config configuration
    JOIN pg_namespace namespace ON namespace.oid=configuration.cfgnamespace
    WHERE namespace.nspname !~ '^pg_'
      AND namespace.nspname <> 'information_schema'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_ts_dict dictionary
    JOIN pg_namespace namespace ON namespace.oid=dictionary.dictnamespace
    WHERE namespace.nspname !~ '^pg_'
      AND namespace.nspname <> 'information_schema'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_ts_parser parser
    JOIN pg_namespace namespace ON namespace.oid=parser.prsnamespace
    WHERE namespace.nspname !~ '^pg_'
      AND namespace.nspname <> 'information_schema'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_ts_template template
    JOIN pg_namespace namespace ON namespace.oid=template.tmplnamespace
    WHERE namespace.nspname !~ '^pg_'
      AND namespace.nspname <> 'information_schema'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_opclass operator_class
    JOIN pg_namespace namespace ON namespace.oid=operator_class.opcnamespace
    WHERE namespace.nspname !~ '^pg_'
      AND namespace.nspname <> 'information_schema'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_opfamily operator_family
    JOIN pg_namespace namespace ON namespace.oid=operator_family.opfnamespace
    WHERE namespace.nspname !~ '^pg_'
      AND namespace.nspname <> 'information_schema'
  )
  AND NOT EXISTS (SELECT 1 FROM pg_transform)
  AND NOT EXISTS (SELECT 1 FROM pg_parameter_acl)
"

# Large objects are a fresh-cutover invariant, not a stable post-cutover one:
# any connected PostgreSQL role can create an owner-only large object through
# PUBLIC-executable catalog functions. Such data grants no additional role or
# code-execution authority, and treating it as permanent drift would let the
# runtime deny later verification. Executable persistence remains forbidden by
# the ownership, schema, SECURITY DEFINER, cast, extension, and trigger checks.
cutover_persistence_safe_sql="
  NOT EXISTS (SELECT 1 FROM pg_largeobject_metadata)
  AND $global_persistence_safe_sql
"

public_persistence_safe_sql="
  NOT EXISTS (
    SELECT 1
    FROM pg_namespace namespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(namespace.nspacl, acldefault('n', namespace.nspowner))
    ) privilege
    WHERE namespace.nspname !~ '^pg_'
      AND namespace.nspname <> 'information_schema'
      AND privilege.grantee=0
  )
  AND $global_persistence_safe_sql
"

prebaseline_fresh_sql="
  to_regnamespace('public') IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM pg_database database
    WHERE database.datname=current_database()
      AND database.datallowconn
      AND database.datconnlimit=-1
      AND database.datistemplate=(database.datname='template1')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_database database
    CROSS JOIN LATERAL aclexplode(database.datacl) privilege
    WHERE database.datname=current_database()
      AND privilege.grantee=0
      AND privilege.privilege_type='CREATE'
  )
  AND NOT has_database_privilege('$RUNTIME_USER',current_database(),'CREATE')
  AND NOT has_database_privilege('$RUNTIME_ROLE',current_database(),'CREATE')
  AND NOT has_schema_privilege('$RUNTIME_USER','public','CREATE')
  AND NOT has_schema_privilege('$RUNTIME_ROLE','public','CREATE')
  AND (
    current_database()='$DATABASE_NAME'
    OR (
      NOT EXISTS (
        SELECT 1
        FROM pg_database database
        WHERE database.datname=current_database()
          AND database.datdba IN (
            SELECT oid FROM pg_roles
            WHERE rolname IN (
              '$RUNTIME_USER','$RUNTIME_ROLE','$MIGRATION_USER','$MIGRATION_ROLE'
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_database database
        CROSS JOIN LATERAL aclexplode(database.datacl) privilege
        WHERE database.datname=current_database()
          AND privilege.grantee IN (
            SELECT oid FROM pg_roles
            WHERE rolname IN (
              '$RUNTIME_USER','$RUNTIME_ROLE','$MIGRATION_USER','$MIGRATION_ROLE'
            )
          )
          AND privilege.privilege_type='CREATE'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_namespace namespace
        WHERE namespace.nspname='public'
          AND namespace.nspowner IN (
            SELECT oid FROM pg_roles
            WHERE rolname IN (
              '$RUNTIME_USER','$RUNTIME_ROLE','$MIGRATION_USER','$MIGRATION_ROLE'
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_namespace namespace
        CROSS JOIN LATERAL aclexplode(namespace.nspacl) privilege
        WHERE namespace.nspname='public'
          AND privilege.grantee IN (
            SELECT oid FROM pg_roles
            WHERE rolname IN (
              '$RUNTIME_USER','$RUNTIME_ROLE','$MIGRATION_USER','$MIGRATION_ROLE'
            )
          )
          AND privilege.privilege_type='CREATE'
      )
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_namespace namespace
    WHERE namespace.nspname !~ '^pg_'
      AND namespace.nspname NOT IN ('information_schema','public')
  )
  AND
  NOT EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname IN ('public','khedmah_taxi')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid=routine.pronamespace
    WHERE namespace.nspname IN ('public','khedmah_taxi')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_type data_type
    JOIN pg_namespace namespace ON namespace.oid=data_type.typnamespace
    WHERE namespace.nspname IN ('public','khedmah_taxi')
  )
  AND to_regnamespace('khedmah_taxi') IS NULL
  AND (
    (
      current_database()='$DATABASE_NAME'
      AND 1=(SELECT count(*) FROM pg_default_acl)
      AND EXISTS (
        SELECT 1
        FROM pg_default_acl defaults
        WHERE defaults.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='$MIGRATION_USER')
          AND defaults.defaclnamespace=0
          AND defaults.defaclobjtype='f'
          AND 1=(
            SELECT count(*)
            FROM aclexplode(defaults.defaclacl) privilege
            WHERE privilege.grantee=defaults.defaclrole
              AND privilege.grantor=defaults.defaclrole
              AND privilege.privilege_type='EXECUTE'
              AND NOT privilege.is_grantable
          )
          AND NOT EXISTS (
            SELECT 1
            FROM aclexplode(defaults.defaclacl) privilege
            WHERE privilege.grantee<>defaults.defaclrole
              OR privilege.grantor<>defaults.defaclrole
              OR privilege.privilege_type<>'EXECUTE'
              OR privilege.is_grantable
          )
      )
    )
    OR (
      current_database()<>'$DATABASE_NAME'
      AND NOT EXISTS (SELECT 1 FROM pg_default_acl)
    )
  )
  AND $cutover_persistence_safe_sql
"

application_objects_trusted_sql="
  NOT EXISTS (
    SELECT 1
    FROM pg_namespace namespace
    WHERE namespace.nspname !~ '^pg_'
      AND namespace.nspname NOT IN ('information_schema','public','khedmah_taxi')
  )
  AND EXISTS (
    SELECT 1
    FROM pg_namespace namespace
    JOIN pg_roles owner_role ON owner_role.oid=namespace.nspowner
    WHERE namespace.nspname='khedmah_taxi'
      AND owner_role.rolname='$MIGRATION_USER'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_proc routine
    JOIN pg_roles owner_role ON owner_role.oid=routine.proowner
    JOIN pg_language language ON language.oid=routine.prolang
    WHERE routine.oid IS NOT DISTINCT FROM to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)')
      AND owner_role.rolname='$MIGRATION_USER'
      AND language.lanname='plpgsql'
      AND routine.prokind='f'
      AND routine.prosecdef
      AND routine.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']::text[]
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    JOIN pg_roles owner_role ON owner_role.oid=relation.relowner
    WHERE namespace.nspname IN ('public','khedmah_taxi')
      AND (
        owner_role.rolname <> '$MIGRATION_USER'
        OR relation.relkind NOT IN ('r','p','i','I','S')
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid=routine.pronamespace
    JOIN pg_roles owner_role ON owner_role.oid=routine.proowner
    WHERE namespace.nspname IN ('public','khedmah_taxi')
      AND owner_role.rolname <> '$MIGRATION_USER'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_type data_type
    JOIN pg_namespace namespace ON namespace.oid=data_type.typnamespace
    JOIN pg_roles owner_role ON owner_role.oid=data_type.typowner
    WHERE namespace.nspname IN ('public','khedmah_taxi')
      AND owner_role.rolname <> '$MIGRATION_USER'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_trigger trigger
    JOIN pg_class relation ON relation.oid=trigger.tgrelid
    JOIN pg_namespace relation_namespace ON relation_namespace.oid=relation.relnamespace
    JOIN pg_proc routine ON routine.oid=trigger.tgfoid
    JOIN pg_namespace routine_namespace ON routine_namespace.oid=routine.pronamespace
    JOIN pg_roles owner_role ON owner_role.oid=routine.proowner
    WHERE NOT trigger.tgisinternal
      AND relation_namespace.nspname IN ('public','khedmah_taxi')
      AND (
        routine_namespace.nspname NOT IN ('public','khedmah_taxi')
        OR owner_role.rolname <> '$MIGRATION_USER'
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_default_acl defaults
    JOIN pg_roles owner_role ON owner_role.oid=defaults.defaclrole
    LEFT JOIN pg_namespace namespace ON namespace.oid=defaults.defaclnamespace
    WHERE owner_role.rolname <> '$MIGRATION_USER'
      OR (
        defaults.defaclnamespace<>0
        AND namespace.nspname NOT IN ('public','khedmah_taxi')
      )
  )
"

ci_database_allowance_sql='false'
case "${CI:-}:${ALLOW_DESTRUCTIVE_DB_TESTS:-}:$DATABASE_NAME" in
  true:true:*_ci|true:true:*_test)
    ci_database_allowance_sql="database.datname ~ '(_ci|_test)$'"
    ;;
esac

# The exact non-application role/attribute/membership manifest is hashed above
# before every phase. It is re-hashed after legacy runtime sessions are killed
# in cutover-audit, when no untrusted principal can still change it. Reject any
# login outside the two application identities, PostgreSQL's default admin, and
# Google's documented Cloud SQL system users; a non-login role cannot reconnect
# after the mandatory control-plane restart.
instance_role_inventory_safe_sql="
  NOT EXISTS (
    SELECT 1
    FROM pg_roles role
    WHERE role.rolcanlogin
      AND role.rolname NOT IN (
        '$RUNTIME_USER', '$MIGRATION_USER', 'postgres',
        'cloudsqladmin', 'cloudsqlagent', 'cloudsqlconnpooladmin',
        'cloudsqlimportexport', 'cloudsqllogical',
        'cloudsqlobservability', 'cloudsqlreplica'
      )
  )
"

instance_database_inventory_safe_sql="
  NOT EXISTS (
    SELECT 1
    FROM pg_database database
    WHERE database.datname NOT IN ('cloudsqladmin','postgres','template0','template1','$DATABASE_NAME')
      AND NOT ($ci_database_allowance_sql)
  )
"

application_login_settings_safe_sql="
  NOT EXISTS (
    SELECT 1
    FROM pg_db_role_setting settings
    JOIN pg_roles configured_role ON configured_role.oid=settings.setrole
    WHERE configured_role.rolname IN ('$RUNTIME_USER','$MIGRATION_USER')
  )
"

transitional_database_access_safe_sql="
  NOT has_database_privilege('$RUNTIME_USER','$DATABASE_NAME','CREATE')
  AND NOT has_database_privilege('$RUNTIME_USER','$DATABASE_NAME','TEMPORARY')
  AND NOT has_database_privilege('$RUNTIME_ROLE','$DATABASE_NAME','CREATE')
  AND NOT has_database_privilege('$RUNTIME_ROLE','$DATABASE_NAME','TEMPORARY')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_database database
    CROSS JOIN LATERAL aclexplode(database.datacl) privilege
    WHERE database.datname='$DATABASE_NAME'
      AND privilege.grantee=0
  )
"

runtime_cutover_membership_safe_sql="
  NOT pg_has_role('$RUNTIME_USER','cloudsqlsuperuser','member')
  AND pg_has_role('$RUNTIME_USER','$RUNTIME_ROLE','usage')
  AND NOT pg_has_role('$RUNTIME_USER','$MIGRATION_ROLE','member')
  AND EXISTS (
    SELECT 1
    FROM pg_roles role
    WHERE role.rolname='$RUNTIME_USER'
      AND role.rolcanlogin AND role.rolinherit
      AND NOT role.rolsuper AND NOT role.rolcreatedb AND NOT role.rolcreaterole
      AND NOT role.rolreplication AND NOT role.rolbypassrls
  )
  AND EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid=membership.roleid
    JOIN pg_roles member_role ON member_role.oid=membership.member
    WHERE granted_role.rolname='$RUNTIME_ROLE'
      AND member_role.rolname='$RUNTIME_USER'
      AND membership.inherit_option
      AND NOT membership.admin_option
  )
  AND 1 = (
    SELECT count(*)
    FROM pg_auth_members membership
    JOIN pg_roles member_role ON member_role.oid=membership.member
    WHERE member_role.rolname='$RUNTIME_USER'
  )
"

runtime_prebaseline_footprint_safe_sql="
  NOT EXISTS (
    SELECT 1
    FROM pg_roles runtime_identity
    WHERE runtime_identity.rolname IN ('$RUNTIME_USER','$RUNTIME_ROLE')
      AND (
        EXISTS (
          SELECT 1 FROM pg_namespace namespace
          WHERE namespace.nspowner=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1 FROM pg_class relation
          WHERE relation.relowner=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1 FROM pg_proc routine
          WHERE routine.proowner=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1 FROM pg_type data_type
          WHERE data_type.typowner=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_namespace namespace
          CROSS JOIN LATERAL aclexplode(namespace.nspacl) privilege
          WHERE privilege.grantee=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_class relation
          CROSS JOIN LATERAL aclexplode(relation.relacl) privilege
          WHERE privilege.grantee=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_attribute attribute
          JOIN pg_class relation ON relation.oid=attribute.attrelid
          CROSS JOIN LATERAL aclexplode(attribute.attacl) privilege
          WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
            AND privilege.grantee=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_proc routine
          CROSS JOIN LATERAL aclexplode(routine.proacl) privilege
          WHERE privilege.grantee=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_type data_type
          CROSS JOIN LATERAL aclexplode(data_type.typacl) privilege
          WHERE privilege.grantee=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_default_acl defaults
          CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege
          WHERE privilege.grantee=runtime_identity.oid
        )
      )
  )
"

# PREPARE replaces PostgreSQL's hard-wired PUBLIC routine EXECUTE default with
# one owner-only global row. HARDEN adds exactly one schema-scoped sequence row
# for the runtime role. Reject every other row, grantee, grantor, privilege, or
# grant option so a migration-owned default ACL cannot persist hidden access.
default_acl_isolation_safe_sql="
  1=(
    SELECT count(*)
    FROM pg_default_acl defaults
    WHERE defaults.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='$MIGRATION_USER')
      AND defaults.defaclnamespace=0
      AND defaults.defaclobjtype='f'
      AND 1=(
        SELECT count(*)
        FROM aclexplode(defaults.defaclacl) privilege
      )
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(defaults.defaclacl) privilege
        WHERE privilege.grantor<>defaults.defaclrole
          OR privilege.grantee<>defaults.defaclrole
          OR privilege.privilege_type<>'EXECUTE'
          OR privilege.is_grantable
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_default_acl defaults
    LEFT JOIN pg_namespace namespace ON namespace.oid=defaults.defaclnamespace
    WHERE defaults.defaclrole<>(SELECT oid FROM pg_roles WHERE rolname='$MIGRATION_USER')
      OR NOT (
        (defaults.defaclnamespace=0 AND defaults.defaclobjtype='f')
        OR (namespace.nspname='public' AND defaults.defaclobjtype='S')
      )
  )
  AND (
    1=(SELECT count(*) FROM pg_default_acl)
    OR (
      2=(SELECT count(*) FROM pg_default_acl)
      AND 1=(
        SELECT count(*)
        FROM pg_default_acl defaults
        JOIN pg_namespace namespace ON namespace.oid=defaults.defaclnamespace
        WHERE defaults.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='$MIGRATION_USER')
          AND namespace.nspname='public'
          AND defaults.defaclobjtype='S'
          AND 2=(
            SELECT count(*)
            FROM aclexplode(defaults.defaclacl) privilege
          )
          AND EXISTS (
            SELECT 1
            FROM aclexplode(defaults.defaclacl) privilege
            WHERE privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
              AND privilege.grantor=defaults.defaclrole
              AND privilege.privilege_type='USAGE'
              AND NOT privilege.is_grantable
          )
          AND EXISTS (
            SELECT 1
            FROM aclexplode(defaults.defaclacl) privilege
            WHERE privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
              AND privilege.grantor=defaults.defaclrole
              AND privilege.privilege_type='SELECT'
              AND NOT privilege.is_grantable
          )
          AND NOT EXISTS (
            SELECT 1
            FROM aclexplode(defaults.defaclacl) privilege
            WHERE privilege.grantee<>(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
              OR privilege.grantor<>defaults.defaclrole
              OR privilege.privilege_type NOT IN ('USAGE','SELECT')
              OR privilege.is_grantable
          )
      )
    )
  )
"

hardened_default_acl_safe_sql="
  $default_acl_isolation_safe_sql
  AND 2=(SELECT count(*) FROM pg_default_acl)
"

verify_isolation_sql="
SELECT CASE WHEN
  $instance_role_inventory_safe_sql
  AND $instance_database_inventory_safe_sql
  AND
  NOT pg_has_role('$RUNTIME_USER','cloudsqlsuperuser','member')
  AND NOT pg_has_role('$MIGRATION_USER','cloudsqlsuperuser','member')
  AND pg_has_role('$RUNTIME_USER','$RUNTIME_ROLE','usage')
  AND pg_has_role('$MIGRATION_USER','$MIGRATION_ROLE','usage')
  AND NOT pg_has_role('$RUNTIME_USER','$RUNTIME_ROLE','member with admin option')
  AND NOT pg_has_role('$MIGRATION_USER','$MIGRATION_ROLE','member with admin option')
  AND NOT pg_has_role('$RUNTIME_USER','$MIGRATION_ROLE','member')
  AND NOT pg_has_role('$MIGRATION_USER','$RUNTIME_ROLE','member')
  AND EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='$RUNTIME_USER'
      AND rolcanlogin AND rolinherit
      AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls
  )
  AND EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='$MIGRATION_USER'
      AND rolcanlogin AND rolinherit
      AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls
  )
  AND EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='$RUNTIME_ROLE'
      AND NOT rolcanlogin AND rolinherit
      AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls
  )
  AND EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='$MIGRATION_ROLE'
      AND NOT rolcanlogin AND rolinherit
      AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls
  )
  AND EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid=membership.roleid
    JOIN pg_roles member_role ON member_role.oid=membership.member
    WHERE granted_role.rolname='$RUNTIME_ROLE'
      AND member_role.rolname='$RUNTIME_USER'
      AND membership.inherit_option
      AND NOT membership.admin_option
  )
  AND EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid=membership.roleid
    JOIN pg_roles member_role ON member_role.oid=membership.member
    WHERE granted_role.rolname='$MIGRATION_ROLE'
      AND member_role.rolname='$MIGRATION_USER'
      AND membership.inherit_option
      AND NOT membership.admin_option
  )
  AND 1 = (
    SELECT count(*)
    FROM pg_auth_members membership
    JOIN pg_roles member_role ON member_role.oid=membership.member
    WHERE member_role.rolname='$RUNTIME_USER'
  )
  AND 1 = (
    SELECT count(*)
    FROM pg_auth_members membership
    JOIN pg_roles member_role ON member_role.oid=membership.member
    WHERE member_role.rolname='$MIGRATION_USER'
  )
  AND 2 = (
    SELECT count(*)
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid=membership.roleid
    WHERE granted_role.rolname IN ('$RUNTIME_ROLE', '$MIGRATION_ROLE')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles member_role ON member_role.oid=membership.member
    WHERE member_role.rolname IN ('$RUNTIME_ROLE', '$MIGRATION_ROLE')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid=membership.roleid
    WHERE granted_role.rolname IN ('$RUNTIME_USER', '$MIGRATION_USER')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_namespace namespace
    WHERE namespace.nspname='$RUNTIME_USER'
  )
  AND $application_login_settings_safe_sql
  AND $default_acl_isolation_safe_sql
  AND $public_persistence_safe_sql
  AND has_database_privilege('$RUNTIME_ROLE','$DATABASE_NAME','CONNECT')
  AND has_database_privilege('$MIGRATION_ROLE','$DATABASE_NAME','CONNECT WITH GRANT OPTION')
  AND has_database_privilege('$MIGRATION_ROLE','$DATABASE_NAME','CREATE WITH GRANT OPTION')
  AND has_schema_privilege('$MIGRATION_ROLE','public','USAGE WITH GRANT OPTION')
  AND has_schema_privilege('$MIGRATION_ROLE','public','CREATE WITH GRANT OPTION')
  AND has_database_privilege('$MIGRATION_USER','$DATABASE_NAME','CONNECT WITH GRANT OPTION')
  AND has_database_privilege('$MIGRATION_USER','$DATABASE_NAME','CREATE WITH GRANT OPTION')
  AND has_schema_privilege('$MIGRATION_USER','public','USAGE WITH GRANT OPTION')
  AND has_schema_privilege('$MIGRATION_USER','public','CREATE WITH GRANT OPTION')
  AND $transitional_database_access_safe_sql
  AND NOT has_schema_privilege('$RUNTIME_USER','public','CREATE')
THEN 'ready' ELSE 'blocked' END"

runtime_hardening_ready_sql="
  $instance_role_inventory_safe_sql
  AND $instance_database_inventory_safe_sql
  AND
  $public_persistence_safe_sql
  AND $application_objects_trusted_sql
  AND $hardened_default_acl_safe_sql
  AND NOT has_database_privilege('$RUNTIME_USER','$DATABASE_NAME','CREATE')
  AND has_schema_privilege('$RUNTIME_USER','public','USAGE')
  AND NOT has_schema_privilege('$RUNTIME_USER','public','CREATE')
  AND has_table_privilege('$RUNTIME_USER','public.core_user_accounts','SELECT')
  AND has_table_privilege('$RUNTIME_USER','public.core_user_accounts','INSERT')
  AND has_schema_privilege('$RUNTIME_USER','khedmah_taxi','USAGE')
  AND has_table_privilege('$RUNTIME_USER','khedmah_taxi.driver_approvals','SELECT')
  AND NOT has_table_privilege('$RUNTIME_USER','khedmah_taxi.driver_approvals','DELETE')
  AND NOT has_table_privilege('$RUNTIME_USER','khedmah_taxi.driver_approvals','TRUNCATE')
  AND has_column_privilege('$RUNTIME_USER','khedmah_taxi.driver_approvals','status','UPDATE')
  AND has_column_privilege('$RUNTIME_USER','khedmah_taxi.driver_approvals','reviewed_by','UPDATE')
  AND NOT has_column_privilege('$RUNTIME_USER','khedmah_taxi.driver_approvals','user_id','UPDATE')
  AND has_column_privilege('$RUNTIME_USER','khedmah_taxi.vehicle_approvals','status','UPDATE')
  AND NOT has_table_privilege('$RUNTIME_USER','khedmah_taxi.vehicle_approvals','DELETE')
  AND NOT has_table_privilege('$RUNTIME_USER','khedmah_taxi.vehicle_approvals','TRUNCATE')
  AND NOT has_column_privilege('$RUNTIME_USER','khedmah_taxi.vehicle_approvals','id','UPDATE')
  AND has_table_privilege('$RUNTIME_USER','khedmah_taxi.operational_approval_events','INSERT')
  AND has_function_privilege('$RUNTIME_USER','khedmah_taxi.resolve_actor_locked(text,boolean)','EXECUTE')
  AND NOT has_schema_privilege('$RUNTIME_USER','khedmah_taxi','CREATE')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_shdepend dependency
    JOIN pg_roles owner_role ON owner_role.oid=dependency.refobjid
    WHERE owner_role.rolname IN ('$RUNTIME_USER', '$RUNTIME_ROLE', '$MIGRATION_ROLE')
      AND dependency.deptype='o'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_shdepend dependency
    JOIN pg_roles grantee ON grantee.oid=dependency.refobjid
    WHERE grantee.rolname IN ('$RUNTIME_USER', '$RUNTIME_ROLE')
      AND dependency.deptype='a'
      AND NOT (
        (
          dependency.dbid=(SELECT oid FROM pg_database WHERE datname=current_database())
          AND dependency.classid IN (
            'pg_namespace'::regclass,
            'pg_class'::regclass,
            'pg_proc'::regclass,
            'pg_type'::regclass,
            'pg_default_acl'::regclass
          )
        )
        OR (
          dependency.dbid=0
          AND dependency.classid='pg_database'::regclass
          AND dependency.objid=(SELECT oid FROM pg_database WHERE datname=current_database())
        )
      )
  )
  AND EXISTS (
    SELECT 1
    FROM pg_database db
    CROSS JOIN LATERAL aclexplode(db.datacl) privilege
    WHERE db.datname='$DATABASE_NAME'
      AND privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
      AND privilege.privilege_type='CONNECT'
      AND NOT privilege.is_grantable
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_database db
    CROSS JOIN LATERAL aclexplode(db.datacl) privilege
    WHERE privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
      AND NOT (
        db.datname='$DATABASE_NAME'
        AND privilege.privilege_type='CONNECT'
        AND NOT privilege.is_grantable
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM (VALUES ('public'), ('khedmah_taxi')) expected_schema(nspname)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_namespace namespace
      CROSS JOIN LATERAL aclexplode(namespace.nspacl) privilege
      WHERE namespace.nspname=expected_schema.nspname
        AND privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
        AND privilege.privilege_type='USAGE'
        AND NOT privilege.is_grantable
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_namespace namespace
    CROSS JOIN LATERAL aclexplode(namespace.nspacl) privilege
    WHERE privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
      AND NOT (
        namespace.nspname IN ('public','khedmah_taxi')
        AND privilege.privilege_type='USAGE'
        AND NOT privilege.is_grantable
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    CROSS JOIN LATERAL aclexplode(relation.relacl) privilege
    WHERE privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
      AND NOT (
        (
          namespace.nspname='public'
          AND (
            (
              relation.relkind IN ('r','p')
              AND privilege.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
            )
            OR (
              relation.relkind='S'
              AND privilege.privilege_type IN ('USAGE','SELECT')
            )
          )
          AND NOT privilege.is_grantable
        )
        OR (
          namespace.nspname='khedmah_taxi'
          AND NOT privilege.is_grantable
          AND (
            (
              relation.relname IN ('driver_approvals','vehicle_approvals')
              AND privilege.privilege_type IN ('SELECT','INSERT')
            )
            OR (
              relation.relname='operational_approval_events'
              AND privilege.privilege_type='INSERT'
            )
          )
        )
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='public'
      AND relation.relkind IN ('r','p')
      AND 4 <> (
        SELECT count(DISTINCT privilege.privilege_type)
        FROM aclexplode(relation.relacl) privilege
        WHERE privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
          AND privilege.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
          AND NOT privilege.is_grantable
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='public'
      AND relation.relkind='S'
      AND (
        SELECT count(DISTINCT privilege.privilege_type)
        FROM aclexplode(relation.relacl) privilege
        WHERE privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
          AND privilege.privilege_type IN ('USAGE','SELECT')
          AND NOT privilege.is_grantable
      ) <> 2
  )
  AND 5 = (
    SELECT count(DISTINCT (relation.oid, privilege.privilege_type))
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    CROSS JOIN LATERAL aclexplode(relation.relacl) privilege
    WHERE namespace.nspname='khedmah_taxi'
      AND privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
      AND NOT privilege.is_grantable
      AND (
        (
          relation.relname IN ('driver_approvals','vehicle_approvals')
          AND privilege.privilege_type IN ('SELECT','INSERT')
        )
        OR (
          relation.relname='operational_approval_events'
          AND privilege.privilege_type='INSERT'
        )
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_attribute attribute
    JOIN pg_class relation ON relation.oid=attribute.attrelid
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    CROSS JOIN LATERAL aclexplode(attribute.attacl) privilege
    WHERE privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
      AND NOT (
        namespace.nspname='khedmah_taxi'
        AND privilege.privilege_type='UPDATE'
        AND NOT privilege.is_grantable
        AND (
          (
            relation.relname='driver_approvals'
            AND attribute.attname IN (
              'business_profile_id','vehicle_id','zone_code','status','reviewed_by',
              'verification_reference','decision_reason','approved_at','expires_at','revision','updated_at'
            )
          )
          OR (
            relation.relname='vehicle_approvals'
            AND attribute.attname IN (
              'driver_user_id','status','reviewed_by','verification_reference','decision_reason',
              'approved_at','expires_at','revision','updated_at'
            )
          )
        )
      )
  )
  AND 20 = (
    SELECT count(DISTINCT (relation.oid, attribute.attnum, privilege.privilege_type))
    FROM pg_attribute attribute
    JOIN pg_class relation ON relation.oid=attribute.attrelid
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    CROSS JOIN LATERAL aclexplode(attribute.attacl) privilege
    WHERE namespace.nspname='khedmah_taxi'
      AND privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
      AND privilege.privilege_type='UPDATE'
      AND NOT privilege.is_grantable
      AND (
        (
          relation.relname='driver_approvals'
          AND attribute.attname IN (
            'business_profile_id','vehicle_id','zone_code','status','reviewed_by',
            'verification_reference','decision_reason','approved_at','expires_at','revision','updated_at'
          )
        )
        OR (
          relation.relname='vehicle_approvals'
          AND attribute.attname IN (
            'driver_user_id','status','reviewed_by','verification_reference','decision_reason',
            'approved_at','expires_at','revision','updated_at'
          )
        )
      )
  )
  AND EXISTS (
    SELECT 1
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid=routine.pronamespace
    CROSS JOIN LATERAL aclexplode(routine.proacl) privilege
    WHERE routine.oid=to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)')
      AND privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
      AND privilege.privilege_type='EXECUTE'
      AND NOT privilege.is_grantable
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc routine
    CROSS JOIN LATERAL aclexplode(routine.proacl) privilege
    WHERE privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
      AND NOT (
        routine.oid=to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)')
        AND privilege.privilege_type='EXECUTE'
        AND NOT privilege.is_grantable
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_type data_type
    CROSS JOIN LATERAL aclexplode(data_type.typacl) privilege
    WHERE privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    CROSS JOIN LATERAL aclexplode(relation.relacl) privilege
    WHERE namespace.nspname IN ('public','khedmah_taxi')
      AND relation.relkind IN ('r','p','v','m','f','S')
      AND privilege.grantee=0
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_attribute attribute
    JOIN pg_class relation ON relation.oid=attribute.attrelid
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    CROSS JOIN LATERAL aclexplode(attribute.attacl) privilege
    WHERE namespace.nspname IN ('public','khedmah_taxi')
      AND attribute.attnum > 0 AND NOT attribute.attisdropped
      AND privilege.grantee=0
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid=routine.pronamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(routine.proacl, acldefault('f', routine.proowner))
    ) privilege
    WHERE namespace.nspname IN ('public','khedmah_taxi')
      AND privilege.grantee=0
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_default_acl defaults
    LEFT JOIN pg_namespace namespace ON namespace.oid=defaults.defaclnamespace
    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege
    WHERE defaults.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='$MIGRATION_USER')
      AND defaults.defaclobjtype IN ('r','S','f')
      AND (defaults.defaclnamespace=0 OR namespace.nspname IN ('public','khedmah_taxi'))
      AND privilege.grantee=0
  )
  AND EXISTS (
    SELECT 1
    FROM pg_default_acl defaults
    WHERE defaults.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='$MIGRATION_USER')
      AND defaults.defaclnamespace=0
      AND defaults.defaclobjtype='f'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_roles runtime_identity
    WHERE runtime_identity.rolname='$RUNTIME_USER'
      AND (
        EXISTS (
          SELECT 1 FROM pg_database db
          WHERE db.datname='$DATABASE_NAME' AND db.datdba=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1 FROM pg_namespace namespace
          WHERE namespace.nspname IN ('public','khedmah_taxi')
            AND namespace.nspowner=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_class relation
          JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
          WHERE namespace.nspname IN ('public','khedmah_taxi')
            AND relation.relowner=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_proc routine
          JOIN pg_namespace namespace ON namespace.oid=routine.pronamespace
          WHERE namespace.nspname IN ('public','khedmah_taxi')
            AND routine.proowner=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_type data_type
          JOIN pg_namespace namespace ON namespace.oid=data_type.typnamespace
          WHERE namespace.nspname IN ('public','khedmah_taxi')
            AND data_type.typowner=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_database db
          CROSS JOIN LATERAL aclexplode(db.datacl) privilege
          WHERE db.datname='$DATABASE_NAME' AND privilege.grantee=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_namespace namespace
          CROSS JOIN LATERAL aclexplode(namespace.nspacl) privilege
          WHERE privilege.grantee=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_class relation
          CROSS JOIN LATERAL aclexplode(relation.relacl) privilege
          WHERE privilege.grantee=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_attribute attribute
          JOIN pg_class relation ON relation.oid=attribute.attrelid
          CROSS JOIN LATERAL aclexplode(attribute.attacl) privilege
          WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
            AND privilege.grantee=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_proc routine
          CROSS JOIN LATERAL aclexplode(routine.proacl) privilege
          WHERE privilege.grantee=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_type data_type
          CROSS JOIN LATERAL aclexplode(data_type.typacl) privilege
          WHERE privilege.grantee=runtime_identity.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_default_acl defaults
          LEFT JOIN pg_namespace namespace ON namespace.oid=defaults.defaclnamespace
          CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege
          WHERE privilege.grantee=runtime_identity.oid
            OR (
              privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
              AND NOT (
                defaults.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='$MIGRATION_USER')
                AND namespace.nspname='public'
                AND defaults.defaclobjtype='S'
                AND privilege.privilege_type IN ('USAGE','SELECT')
                AND NOT privilege.is_grantable
              )
            )
        )
        OR 2 <> (
          SELECT count(DISTINCT (defaults.defaclobjtype, privilege.privilege_type))
          FROM pg_default_acl defaults
          JOIN pg_namespace namespace ON namespace.oid=defaults.defaclnamespace
          CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege
          WHERE defaults.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='$MIGRATION_USER')
            AND namespace.nspname='public'
            AND privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
            AND NOT privilege.is_grantable
            AND defaults.defaclobjtype='S'
            AND privilege.privilege_type IN ('USAGE','SELECT')
        )
      )
  )"

case "$PHASE" in
  prepare)
    psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-production-schema-change', 0));
DO \$roles\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$RUNTIME_ROLE') THEN
    EXECUTE 'CREATE ROLE "$RUNTIME_ROLE" NOLOGIN NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$MIGRATION_ROLE') THEN
    EXECUTE 'CREATE ROLE "$MIGRATION_ROLE" NOLOGIN NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION';
  END IF;
END
\$roles\$;
DO \$safe_existing_roles\$
BEGIN
  IF NOT (
$instance_role_inventory_safe_sql
  ) OR NOT (
$instance_database_inventory_safe_sql
  ) THEN
    RAISE EXCEPTION 'DATABASE_INSTANCE_IDENTITY_INVENTORY_NOT_SAFE';
  END IF;

  IF (
    SELECT count(*) FROM pg_roles
    WHERE rolname IN ('$RUNTIME_ROLE', '$MIGRATION_ROLE')
  ) <> 2 OR EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname IN ('$RUNTIME_ROLE', '$MIGRATION_ROLE')
      AND (
        rolcanlogin OR NOT rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole
        OR rolreplication OR rolbypassrls
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles member_role ON member_role.oid=membership.member
    WHERE member_role.rolname IN ('$RUNTIME_ROLE', '$MIGRATION_ROLE')
  ) THEN
    RAISE EXCEPTION 'DATABASE_ROLE_CUSTOM_ROLE_ATTRIBUTES_NOT_SAFE';
  END IF;

  IF (
    SELECT count(*) FROM pg_roles
    WHERE rolname IN ('$RUNTIME_USER', '$MIGRATION_USER')
  ) <> 2 OR EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname IN ('$RUNTIME_USER', '$MIGRATION_USER')
      AND (
        NOT rolcanlogin OR NOT rolinherit OR rolsuper
        OR rolreplication OR rolbypassrls
      )
  ) THEN
    RAISE EXCEPTION 'DATABASE_ROLE_LOGIN_BASE_ATTRIBUTES_NOT_SAFE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_namespace namespace
    WHERE namespace.nspname='$RUNTIME_USER'
  ) THEN
    RAISE EXCEPTION 'DATABASE_ROLE_RUNTIME_SCHEMA_NOT_SAFE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_db_role_setting settings
    JOIN pg_roles configured_role ON configured_role.oid=settings.setrole
    WHERE configured_role.rolname='$RUNTIME_USER'
  ) THEN
    RAISE EXCEPTION 'DATABASE_ROLE_RUNTIME_CONFIG_NOT_SAFE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_roles grantee
    WHERE grantee.rolname IN ('$RUNTIME_USER','$RUNTIME_ROLE')
      AND (
        EXISTS (
          SELECT 1
          FROM pg_class relation
          CROSS JOIN LATERAL aclexplode(relation.relacl) privilege
          WHERE privilege.grantee=grantee.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_attribute attribute
          JOIN pg_class relation ON relation.oid=attribute.attrelid
          CROSS JOIN LATERAL aclexplode(attribute.attacl) privilege
          WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
            AND privilege.grantee=grantee.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_proc routine
          CROSS JOIN LATERAL aclexplode(routine.proacl) privilege
          WHERE privilege.grantee=grantee.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_type data_type
          CROSS JOIN LATERAL aclexplode(data_type.typacl) privilege
          WHERE privilege.grantee=grantee.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_default_acl defaults
          CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege
          WHERE privilege.grantee=grantee.oid
        )
      )
  ) THEN
    RAISE EXCEPTION 'DATABASE_ROLE_PREEXISTING_RUNTIME_ACL_NOT_SAFE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_namespace namespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(namespace.nspacl, acldefault('n', namespace.nspowner))
    ) privilege
    WHERE namespace.nspname !~ '^pg_'
      AND namespace.nspname NOT IN ('information_schema','public','khedmah_taxi')
      AND privilege.grantee=0
  ) OR EXISTS (
    SELECT 1
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid=routine.pronamespace
    JOIN pg_roles owner_role ON owner_role.oid=routine.proowner
    JOIN pg_language language ON language.oid=routine.prolang
    WHERE namespace.nspname !~ '^pg_'
      AND namespace.nspname <> 'information_schema'
      AND routine.prosecdef
      AND NOT (
        routine.oid IS NOT DISTINCT FROM to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)')
        AND owner_role.rolname='$MIGRATION_USER'
        AND language.lanname='plpgsql'
        AND routine.prokind='f'
        AND routine.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']::text[]
      )
  ) OR EXISTS (SELECT 1 FROM pg_largeobject_metadata)
    OR EXISTS (SELECT 1 FROM pg_foreign_server)
    OR EXISTS (SELECT 1 FROM pg_foreign_data_wrapper)
    OR EXISTS (SELECT 1 FROM pg_user_mappings)
    OR EXISTS (SELECT 1 FROM pg_event_trigger)
    OR EXISTS (SELECT 1 FROM pg_publication)
    OR EXISTS (SELECT 1 FROM pg_subscription)
    OR EXISTS (SELECT 1 FROM pg_prepared_xacts)
    OR EXISTS (SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql')
    OR EXISTS (SELECT 1 FROM pg_cast WHERE oid >= 16384)
  THEN
    RAISE EXCEPTION 'DATABASE_PUBLIC_PERSISTENCE_NOT_SAFE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_shdepend dependency
    JOIN pg_roles owner_role ON owner_role.oid=dependency.refobjid
    WHERE owner_role.rolname IN ('$RUNTIME_USER', '$RUNTIME_ROLE', '$MIGRATION_ROLE')
      AND dependency.deptype='o'
  ) THEN
    RAISE EXCEPTION 'DATABASE_ROLE_OWNERSHIP_NOT_SAFE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_shdepend dependency
    JOIN pg_roles grantee ON grantee.oid=dependency.refobjid
    WHERE grantee.rolname IN ('$RUNTIME_USER', '$RUNTIME_ROLE', '$MIGRATION_ROLE')
      AND dependency.deptype='a'
      AND NOT (
        (
          dependency.dbid=(SELECT oid FROM pg_database WHERE datname=current_database())
          AND dependency.classid IN (
            'pg_namespace'::regclass,
            'pg_class'::regclass,
            'pg_proc'::regclass,
            'pg_type'::regclass,
            'pg_default_acl'::regclass
          )
        )
        OR (
          dependency.dbid=0
          AND dependency.classid='pg_database'::regclass
          AND dependency.objid=(SELECT oid FROM pg_database WHERE datname=current_database())
        )
      )
  ) THEN
    RAISE EXCEPTION 'DATABASE_ROLE_CROSS_DATABASE_ACL_NOT_SAFE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_roles grantee
    WHERE grantee.rolname IN ('$RUNTIME_USER', '$RUNTIME_ROLE', '$MIGRATION_ROLE')
      AND (
        EXISTS (
          SELECT 1
          FROM pg_namespace namespace
          CROSS JOIN LATERAL aclexplode(namespace.nspacl) privilege
          WHERE namespace.nspname NOT IN ('public','khedmah_taxi')
            AND privilege.grantee=grantee.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_class relation
          JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
          CROSS JOIN LATERAL aclexplode(relation.relacl) privilege
          WHERE namespace.nspname NOT IN ('public','khedmah_taxi')
            AND privilege.grantee=grantee.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_attribute attribute
          JOIN pg_class relation ON relation.oid=attribute.attrelid
          JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
          CROSS JOIN LATERAL aclexplode(attribute.attacl) privilege
          WHERE namespace.nspname NOT IN ('public','khedmah_taxi')
            AND attribute.attnum > 0 AND NOT attribute.attisdropped
            AND privilege.grantee=grantee.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_proc routine
          JOIN pg_namespace namespace ON namespace.oid=routine.pronamespace
          CROSS JOIN LATERAL aclexplode(routine.proacl) privilege
          WHERE namespace.nspname NOT IN ('public','khedmah_taxi')
            AND privilege.grantee=grantee.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_type data_type
          JOIN pg_namespace namespace ON namespace.oid=data_type.typnamespace
          CROSS JOIN LATERAL aclexplode(data_type.typacl) privilege
          WHERE namespace.nspname NOT IN ('public','khedmah_taxi')
            AND privilege.grantee=grantee.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_default_acl defaults
          LEFT JOIN pg_namespace namespace ON namespace.oid=defaults.defaclnamespace
          CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege
          WHERE privilege.grantee=grantee.oid
            AND NOT (
              grantee.rolname='$RUNTIME_ROLE'
              AND defaults.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='$MIGRATION_USER')
              AND namespace.nspname='public'
              AND NOT privilege.is_grantable
              AND defaults.defaclobjtype='S'
              AND privilege.privilege_type IN ('USAGE','SELECT')
            )
        )
      )
  ) THEN
    RAISE EXCEPTION 'DATABASE_ROLE_OUT_OF_SCOPE_ACL_NOT_SAFE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid=membership.roleid
    WHERE granted_role.rolname IN ('$RUNTIME_USER', '$MIGRATION_USER')
  ) THEN
    RAISE EXCEPTION 'DATABASE_ROLE_LOGIN_GRANTEES_NOT_SAFE';
  END IF;

  IF EXISTS (
    WITH RECURSIVE custom_role_memberships(root_roleid, member_oid) AS (
      SELECT membership.roleid, membership.member
      FROM pg_auth_members membership
      JOIN pg_roles granted_role ON granted_role.oid=membership.roleid
      WHERE granted_role.rolname IN ('$RUNTIME_ROLE', '$MIGRATION_ROLE')
      UNION
      SELECT inherited.root_roleid, membership.member
      FROM custom_role_memberships inherited
      JOIN pg_auth_members membership ON membership.roleid=inherited.member_oid
    )
    SELECT 1
    FROM custom_role_memberships membership
    JOIN pg_roles granted_role ON granted_role.oid=membership.root_roleid
    JOIN pg_roles member_role ON member_role.oid=membership.member_oid
    WHERE NOT (
      member_role.rolname='$MIGRATION_USER'
      OR (
        granted_role.rolname='$RUNTIME_ROLE'
        AND member_role.rolname='$RUNTIME_USER'
      )
    )
  ) THEN
    RAISE EXCEPTION 'DATABASE_ROLE_CUSTOM_ROLE_GRANTEES_NOT_SAFE';
  END IF;
END
\$safe_existing_roles\$;
-- PostgreSQL 16 does not let one CREATEROLE login alter a sibling login
-- without ADMIN OPTION. The migration login can and must clear only its own
-- defaults. Runtime defaults must already be absent; every trusted runtime
-- client supplies role=none and an explicit search_path at startup.
DO \$clear_migration_settings\$
DECLARE
  configured_database text;
BEGIN
  FOR configured_database IN
    SELECT database.datname
    FROM pg_db_role_setting settings
    JOIN pg_roles configured_role ON configured_role.oid=settings.setrole
    JOIN pg_database database ON database.oid=settings.setdatabase
    WHERE configured_role.rolname='$MIGRATION_USER'
      AND settings.setdatabase<>0
  LOOP
    EXECUTE format(
      'ALTER ROLE %I IN DATABASE %I RESET ALL',
      '$MIGRATION_USER', configured_database
    );
  END LOOP;
  EXECUTE format('ALTER ROLE %I RESET ALL', '$MIGRATION_USER');
END
\$clear_migration_settings\$;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON ROUTINES FROM PUBLIC;
DO \$optional_taxi_public\$
BEGIN
  IF to_regnamespace('khedmah_taxi') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON SCHEMA khedmah_taxi FROM PUBLIC';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA khedmah_taxi FROM PUBLIC';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA khedmah_taxi FROM PUBLIC';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA khedmah_taxi FROM PUBLIC';
  END IF;
END
\$optional_taxi_public\$;
REVOKE ALL PRIVILEGES ON DATABASE "$DATABASE_NAME" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON DATABASE "$DATABASE_NAME" FROM "$RUNTIME_USER";
REVOKE ALL ON SCHEMA public FROM "$RUNTIME_USER";
DO \$runtime_connect\$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_database db
    CROSS JOIN LATERAL aclexplode(db.datacl) privilege
    WHERE db.datname='$DATABASE_NAME'
      AND privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
      AND privilege.privilege_type='CONNECT'
      AND NOT privilege.is_grantable
  ) THEN
    EXECUTE 'GRANT CONNECT ON DATABASE "$DATABASE_NAME" TO "$RUNTIME_ROLE"';
  END IF;
END
\$runtime_connect\$;
GRANT CONNECT, CREATE ON DATABASE "$DATABASE_NAME" TO "$MIGRATION_ROLE" WITH GRANT OPTION;
GRANT USAGE, CREATE ON SCHEMA public TO "$MIGRATION_ROLE" WITH GRANT OPTION;
DO \$delegation_ready\$
BEGIN
  IF NOT (
$instance_role_inventory_safe_sql
    )
    OR NOT (
$instance_database_inventory_safe_sql
    )
    OR NOT (
$transitional_database_access_safe_sql
    )
    OR has_database_privilege('$RUNTIME_ROLE', '$DATABASE_NAME', 'CREATE')
    OR has_schema_privilege('$RUNTIME_ROLE', 'public', 'CREATE')
    OR NOT has_database_privilege('$MIGRATION_ROLE', '$DATABASE_NAME', 'CONNECT WITH GRANT OPTION')
    OR NOT has_database_privilege('$MIGRATION_ROLE', '$DATABASE_NAME', 'CREATE WITH GRANT OPTION')
    OR NOT has_schema_privilege('$MIGRATION_ROLE', 'public', 'USAGE WITH GRANT OPTION')
    OR NOT has_schema_privilege('$MIGRATION_ROLE', 'public', 'CREATE WITH GRANT OPTION')
    OR EXISTS (
      SELECT 1
      FROM pg_namespace namespace
      WHERE namespace.nspname='$RUNTIME_USER'
    )
    OR NOT (
$application_login_settings_safe_sql
    )
    OR NOT (
$public_persistence_safe_sql
    )
  THEN
    RAISE EXCEPTION 'DATABASE_ROLE_DELEGATION_NOT_READY';
  END IF;
END
\$delegation_ready\$;
COMMIT;
SQL
    echo 'DATABASE_ROLE_PREPARE_COMPLETE'
    ;;
  cutover-audit)
    # A role-membership update does not change current_role in an already-open
    # backend. The workflow rotates the migration password before this phase,
    # so only this trusted job knows a credential that can reconnect. Kill all
    # earlier runtime and migration backends before consulting the untrusted
    # role manifest or database catalogs.
    termination_state="$(psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
SELECT CASE WHEN COALESCE(bool_and(pg_terminate_backend(activity.pid, 5000)), true)
  THEN 'ready' ELSE 'blocked' END
FROM pg_stat_activity activity
WHERE activity.usename IN ('$RUNTIME_USER','$MIGRATION_USER')
  AND activity.backend_type='client backend'
  AND activity.pid <> pg_backend_pid()")"
    test "$termination_state" = ready || {
      echo 'ERROR: DATABASE_PRIVILEGED_SESSION_TERMINATION_FAILED' >&2
      exit 10
    }

    remaining_session_state="$(psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
SELECT CASE WHEN NOT EXISTS (
  SELECT 1
  FROM pg_stat_activity activity
  WHERE activity.usename IN ('$RUNTIME_USER','$MIGRATION_USER')
    AND activity.backend_type='client backend'
    AND activity.pid <> pg_backend_pid()
) THEN 'ready' ELSE 'blocked' END")"
    test "$remaining_session_state" = ready || {
      echo 'ERROR: DATABASE_PRIVILEGED_SESSION_STILL_ACTIVE' >&2
      exit 10
    }

    # The mandatory Cloud SQL restart has removed every legacy session. Clear
    # all global and database-scoped defaults on the current migration login
    # before inspecting the final cutover state. Runtime defaults cannot be
    # changed by this sibling login on PostgreSQL 16 and therefore must remain
    # absent from the fresh-instance contract.
    psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-production-schema-change', 0));
DO \$clear_migration_settings\$
DECLARE
  configured_database text;
BEGIN
  FOR configured_database IN
    SELECT database.datname
    FROM pg_db_role_setting settings
    JOIN pg_roles configured_role ON configured_role.oid=settings.setrole
    JOIN pg_database database ON database.oid=settings.setdatabase
    WHERE configured_role.rolname='$MIGRATION_USER'
      AND settings.setdatabase<>0
  LOOP
    EXECUTE format(
      'ALTER ROLE %I IN DATABASE %I RESET ALL',
      '$MIGRATION_USER', configured_database
    );
  END LOOP;
  EXECUTE format('ALTER ROLE %I RESET ALL', '$MIGRATION_USER');
END
\$clear_migration_settings\$;
COMMIT;
SQL

    state="$(psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
SELECT CASE WHEN
  $instance_role_inventory_safe_sql
  AND $instance_database_inventory_safe_sql
  AND $runtime_cutover_membership_safe_sql
  AND $application_login_settings_safe_sql
  AND pg_has_role('$MIGRATION_USER','cloudsqlsuperuser','member')
THEN 'ready' ELSE 'blocked' END")"
    test "$state" = ready || {
      echo 'ERROR: DATABASE_RUNTIME_CUTOVER_NOT_READY' >&2
      exit 10
    }

    actual_system_role_manifest_sha256="$(compute_system_role_manifest_sha256)"
    test "$actual_system_role_manifest_sha256" = "$DATABASE_SYSTEM_ROLE_MANIFEST_SHA256" || {
      echo 'ERROR: DATABASE_SYSTEM_ROLE_MANIFEST_MISMATCH_AFTER_CUTOVER' >&2
      exit 11
    }

    # The cluster-level login existed before cutover, so audit the target and
    # both connectable PostgreSQL template/system databases after containment.
    # PUBLIC USAGE on their empty public schemas is harmless; CREATE and every
    # executable persistence surface remain forbidden by prebaseline_fresh_sql.
    for audited_database in "$DATABASE_NAME" postgres template1; do
      audited_database_url="${PSQL_DATABASE_URL%/*}/$audited_database"
      audit_state="$(psql "$audited_database_url" -X -v ON_ERROR_STOP=1 -Atc "
SELECT CASE WHEN
  current_user='$MIGRATION_USER'
  AND session_user='$MIGRATION_USER'
  AND current_database()='$audited_database'
  AND $prebaseline_fresh_sql
THEN 'ready' ELSE 'blocked' END")"
      test "$audit_state" = ready || {
        echo "ERROR: DATABASE_PREBASELINE_CATALOG_NOT_FRESH: $audited_database" >&2
        exit 10
      }
    done

    disconnected_migration_password="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
    is_managed_hex_password "$disconnected_migration_password" || {
      echo 'ERROR: DATABASE_MIGRATION_DISCONNECT_PASSWORD_GENERATION_FAILED' >&2
      exit 10
    }

    psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-production-schema-change', 0));
DO \$runtime_cutover_audit\$
BEGIN
  IF NOT (
$instance_role_inventory_safe_sql
  ) OR NOT (
$instance_database_inventory_safe_sql
  ) OR NOT (
$runtime_cutover_membership_safe_sql
  ) OR NOT (
$application_login_settings_safe_sql
  ) OR NOT pg_has_role('$MIGRATION_USER','cloudsqlsuperuser','member')
    OR NOT (
$transitional_database_access_safe_sql
  ) OR NOT (
$runtime_prebaseline_footprint_safe_sql
  ) OR NOT (
$prebaseline_fresh_sql
  )
  THEN
    RAISE EXCEPTION 'DATABASE_RUNTIME_CUTOVER_AUDIT_NOT_SAFE';
  END IF;
END
\$runtime_cutover_audit\$;
-- The workflow demotes this built-in user immediately after the job exits.
-- Replace the workflow-known credential first so no session can enter the
-- small control-plane interval with the still-effective Cloud SQL superuser
-- role. The workflow issues a fresh managed credential after demotion.
ALTER ROLE "$MIGRATION_USER" PASSWORD '$disconnected_migration_password';
COMMIT;
SQL
    unset disconnected_migration_password
    echo 'DATABASE_RUNTIME_CUTOVER_AUDITED'
    ;;
  verify)
    state="$(psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "$verify_isolation_sql")"
    test "$state" = ready || {
      echo 'ERROR: DATABASE_ROLE_ISOLATION_NOT_READY' >&2
      exit 7
    }
    echo 'DATABASE_ROLE_ISOLATION_VERIFIED'
    ;;
  verify-hardened)
    state="$(psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "$verify_isolation_sql")"
    test "$state" = ready || {
      echo 'ERROR: DATABASE_ROLE_ISOLATION_NOT_READY' >&2
      exit 7
    }
    canonical="$(psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "SELECT to_regclass('public.food_promo_codes') IS NOT NULL AND to_regclass('public.fulfillment_orders') IS NOT NULL AND to_regclass('khedmah_taxi.driver_approvals') IS NOT NULL")"
    test "$canonical" = t || {
      echo 'ERROR: RUNTIME_HARDENING_REQUIRES_CANONICAL_034' >&2
      exit 8
    }
    post="$(psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
SELECT CASE WHEN
$runtime_hardening_ready_sql
THEN 'ready' ELSE 'blocked' END")"
    test "$post" = ready || {
      echo 'ERROR: RUNTIME_DATABASE_HARDENING_POSTCONDITION_FAILED' >&2
      exit 9
    }
    echo 'RUNTIME_DATABASE_HARDENING_VERIFIED'
    ;;
  harden)
    state="$(psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "$verify_isolation_sql")"
    test "$state" = ready || {
      echo 'ERROR: DATABASE_ROLE_ISOLATION_NOT_READY' >&2
      exit 7
    }
    canonical="$(psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "SELECT to_regclass('public.food_promo_codes') IS NOT NULL AND to_regclass('public.fulfillment_orders') IS NOT NULL AND to_regclass('khedmah_taxi.driver_approvals') IS NOT NULL")"
    test "$canonical" = t || {
      echo 'ERROR: RUNTIME_HARDENING_REQUIRES_CANONICAL_034' >&2
      exit 8
    }
    psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-production-schema-change', 0));
DO \$public_persistence_guard\$
BEGIN
  IF NOT (
$public_persistence_safe_sql
  ) OR NOT (
$application_objects_trusted_sql
  ) THEN
    RAISE EXCEPTION 'DATABASE_PUBLIC_PERSISTENCE_NOT_SAFE';
  END IF;
END
\$public_persistence_guard\$;

REVOKE ALL PRIVILEGES ON DATABASE "$DATABASE_NAME" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON DATABASE "$DATABASE_NAME" FROM "$RUNTIME_USER";
REVOKE CREATE ON DATABASE "$DATABASE_NAME" FROM "$RUNTIME_ROLE";
DO \$runtime_connect\$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_database db
    CROSS JOIN LATERAL aclexplode(db.datacl) privilege
    WHERE db.datname='$DATABASE_NAME'
      AND privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='$RUNTIME_ROLE')
      AND privilege.privilege_type='CONNECT'
      AND NOT privilege.is_grantable
  ) THEN
    EXECUTE 'GRANT CONNECT ON DATABASE "$DATABASE_NAME" TO "$RUNTIME_ROLE"';
  END IF;
END
\$runtime_connect\$;
GRANT CONNECT, CREATE ON DATABASE "$DATABASE_NAME" TO "$MIGRATION_ROLE";

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM "$RUNTIME_USER";
REVOKE ALL ON SCHEMA public FROM "$RUNTIME_ROLE";
GRANT USAGE ON SCHEMA public TO "$RUNTIME_ROLE";
GRANT USAGE, CREATE ON SCHEMA public TO "$MIGRATION_ROLE";

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "$RUNTIME_USER";
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "$RUNTIME_ROLE";
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
DO \$runtime_public_table_acl\$
DECLARE
  relation_name text;
BEGIN
  FOR relation_name IN
    SELECT relation.relname
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='public'
      AND relation.relkind IN ('r','p')
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I TO %I',
      'public', relation_name, '$RUNTIME_ROLE'
    );
  END LOOP;
END
\$runtime_public_table_acl\$;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM "$RUNTIME_USER";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM "$RUNTIME_ROLE";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "$RUNTIME_ROLE";
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM "$RUNTIME_USER";
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM "$RUNTIME_ROLE";
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;

ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM "$RUNTIME_USER";
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM "$RUNTIME_ROLE";
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM "$RUNTIME_USER";
ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM "$RUNTIME_ROLE";
ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON ROUTINES FROM "$RUNTIME_USER";
ALTER DEFAULT PRIVILEGES REVOKE ALL ON ROUTINES FROM "$RUNTIME_ROLE";
ALTER DEFAULT PRIVILEGES REVOKE ALL ON ROUTINES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TYPES FROM "$RUNTIME_USER";
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TYPES FROM "$RUNTIME_ROLE";

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM "$RUNTIME_USER";
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM "$RUNTIME_ROLE";
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM "$RUNTIME_USER";
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM "$RUNTIME_ROLE";
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "$RUNTIME_ROLE";
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM "$RUNTIME_USER";
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM "$RUNTIME_ROLE";
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TYPES FROM "$RUNTIME_USER";
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TYPES FROM "$RUNTIME_ROLE";

REVOKE ALL ON SCHEMA khedmah_taxi FROM "$RUNTIME_USER";
REVOKE ALL ON SCHEMA khedmah_taxi FROM "$RUNTIME_ROLE";
REVOKE ALL ON SCHEMA khedmah_taxi FROM PUBLIC;
GRANT USAGE ON SCHEMA khedmah_taxi TO "$RUNTIME_ROLE";
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA khedmah_taxi FROM "$RUNTIME_USER";
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA khedmah_taxi FROM "$RUNTIME_ROLE";
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA khedmah_taxi FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA khedmah_taxi FROM "$RUNTIME_USER";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA khedmah_taxi FROM "$RUNTIME_ROLE";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA khedmah_taxi FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA khedmah_taxi FROM "$RUNTIME_USER";
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA khedmah_taxi FROM "$RUNTIME_ROLE";
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA khedmah_taxi FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA khedmah_taxi REVOKE ALL ON TABLES FROM "$RUNTIME_USER";
ALTER DEFAULT PRIVILEGES IN SCHEMA khedmah_taxi REVOKE ALL ON TABLES FROM "$RUNTIME_ROLE";
ALTER DEFAULT PRIVILEGES IN SCHEMA khedmah_taxi REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA khedmah_taxi REVOKE ALL ON SEQUENCES FROM "$RUNTIME_USER";
ALTER DEFAULT PRIVILEGES IN SCHEMA khedmah_taxi REVOKE ALL ON SEQUENCES FROM "$RUNTIME_ROLE";
ALTER DEFAULT PRIVILEGES IN SCHEMA khedmah_taxi REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA khedmah_taxi REVOKE ALL ON ROUTINES FROM "$RUNTIME_USER";
ALTER DEFAULT PRIVILEGES IN SCHEMA khedmah_taxi REVOKE ALL ON ROUTINES FROM "$RUNTIME_ROLE";
ALTER DEFAULT PRIVILEGES IN SCHEMA khedmah_taxi REVOKE ALL ON ROUTINES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA khedmah_taxi REVOKE ALL ON TYPES FROM "$RUNTIME_USER";
ALTER DEFAULT PRIVILEGES IN SCHEMA khedmah_taxi REVOKE ALL ON TYPES FROM "$RUNTIME_ROLE";

DO \$runtime_column_acl\$
DECLARE
  direct_acl record;
BEGIN
  FOR direct_acl IN
    SELECT
      namespace.nspname,
      relation.relname,
      grantee.rolname,
      privilege.grantee=0 AS public_grantee,
      string_agg(
        DISTINCT quote_ident(attribute.attname),
        ', ' ORDER BY quote_ident(attribute.attname)
      ) AS column_list
    FROM pg_attribute attribute
    JOIN pg_class relation ON relation.oid=attribute.attrelid
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    CROSS JOIN LATERAL aclexplode(attribute.attacl) privilege
    LEFT JOIN pg_roles grantee ON grantee.oid=privilege.grantee
    WHERE namespace.nspname IN ('public','khedmah_taxi')
      AND attribute.attnum > 0 AND NOT attribute.attisdropped
      AND (
        privilege.grantee=0
        OR grantee.rolname IN ('$RUNTIME_USER','$RUNTIME_ROLE')
      )
    GROUP BY
      namespace.nspname,
      relation.relname,
      grantee.rolname,
      privilege.grantee=0
  LOOP
    IF direct_acl.public_grantee THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES (%s) ON TABLE %I.%I FROM PUBLIC',
        direct_acl.column_list,
        direct_acl.nspname,
        direct_acl.relname
      );
    ELSE
      EXECUTE format(
        'REVOKE ALL PRIVILEGES (%s) ON TABLE %I.%I FROM %I',
        direct_acl.column_list,
        direct_acl.nspname,
        direct_acl.relname,
        direct_acl.rolname
      );
    END IF;
  END LOOP;
END
\$runtime_column_acl\$;

DO \$runtime_type_acl\$
DECLARE
  direct_acl record;
BEGIN
  FOR direct_acl IN
    SELECT namespace.nspname, data_type.typname, grantee.rolname
    FROM pg_type data_type
    JOIN pg_namespace namespace ON namespace.oid=data_type.typnamespace
    CROSS JOIN LATERAL aclexplode(data_type.typacl) privilege
    JOIN pg_roles grantee ON grantee.oid=privilege.grantee
    WHERE namespace.nspname IN ('public','khedmah_taxi')
      AND grantee.rolname IN ('$RUNTIME_USER','$RUNTIME_ROLE')
    GROUP BY namespace.nspname, data_type.typname, grantee.rolname
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TYPE %I.%I FROM %I',
      direct_acl.nspname,
      direct_acl.typname,
      direct_acl.rolname
    );
  END LOOP;
END
\$runtime_type_acl\$;

-- Operational approval APIs run inside the application runtime but remain
-- constrained by application authorization and database review invariants.
GRANT SELECT, INSERT ON TABLE
  khedmah_taxi.driver_approvals,
  khedmah_taxi.vehicle_approvals
TO "$RUNTIME_ROLE";
GRANT UPDATE(
  business_profile_id, vehicle_id, zone_code, status, reviewed_by,
  verification_reference, decision_reason, approved_at, expires_at, revision, updated_at
) ON khedmah_taxi.driver_approvals TO "$RUNTIME_ROLE";
GRANT UPDATE(
  driver_user_id, status, reviewed_by, verification_reference, decision_reason,
  approved_at, expires_at, revision, updated_at
) ON khedmah_taxi.vehicle_approvals TO "$RUNTIME_ROLE";
GRANT INSERT ON TABLE khedmah_taxi.operational_approval_events TO "$RUNTIME_ROLE";

-- Taxi trip execution remains disabled in canonical schema 034.
-- The jt_* trip schema is still candidate-only and is intentionally not granted here.

GRANT EXECUTE ON FUNCTION
  khedmah_taxi.resolve_actor_locked(TEXT, BOOLEAN)
TO "$RUNTIME_ROLE";

DO \$runtime_hardening_postcondition\$
BEGIN
  IF NOT (
$runtime_hardening_ready_sql
  ) THEN
    RAISE EXCEPTION 'RUNTIME_DATABASE_HARDENING_POSTCONDITION_FAILED';
  END IF;
END
\$runtime_hardening_postcondition\$;

COMMIT;
SQL

    post="$(psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
SELECT CASE WHEN
$runtime_hardening_ready_sql
THEN 'ready' ELSE 'blocked' END")"
    test "$post" = ready || {
      echo 'ERROR: RUNTIME_DATABASE_HARDENING_POSTCONDITION_FAILED' >&2
      exit 9
    }
    echo 'RUNTIME_DATABASE_HARDENING_VERIFIED'
    ;;
esac
