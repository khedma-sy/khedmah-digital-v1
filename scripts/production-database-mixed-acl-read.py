#!/usr/bin/env python3
"""Read-only confirmation of the two completed Phase A ACL transactions.

Uses the unchanged, hash-pinned operator's credential/proxy/read helpers only.
Does not call its execute/main functions or require/replay the backup/mutation.
SQL predicates are copied from the approved Phase A pre/postconditions.
Passing this check does not demote runtime or prove session containment.
"""
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path

OPERATOR_SHA256 = "d3e08e4937103b2824890f4b8216854558209271003bd5d090428c271e49f28f"
EXPECTED_MANIFEST = "656ccf46a96a6ea32a3c0a9f3ea8ced8a266390b544d2cee6dbbb221a2e614cf"
CHECKS = ("mixed_roles_unchanged", "catalog_unchanged",
          "migrator_defaults_ready", "staged_acl_ready")
SQL = r"""BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
SELECT json_build_object(
 'database', current_database(), 'current_user', current_user,
 'session_user', session_user,
 'read_only', current_setting('transaction_read_only'),
 'evidence_utc', clock_timestamp() AT TIME ZONE 'UTC',
 'system_role_manifest_sha256',
 (SELECT encode(sha256(convert_to(string_agg(line, E'\n' ORDER BY line) || E'\n', 'UTF8')), 'hex')
  FROM (__MANIFEST__) AS manifest),
 'mixed_roles_unchanged', NOT ((SELECT count(*) FROM pg_roles WHERE rolname IN
     ('khedmah_app','khedmah_migrator','khedmah_runtime_role','khedmah_migration_role'))<>4
 OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='khedmah_app'
     AND rolcanlogin AND rolinherit AND rolcreaterole AND rolcreatedb
     AND NOT rolsuper AND NOT rolreplication AND NOT rolbypassrls)
 OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='khedmah_migrator'
     AND rolcanlogin AND rolinherit AND NOT rolcreaterole AND NOT rolcreatedb
     AND NOT rolsuper AND NOT rolreplication AND NOT rolbypassrls)
 OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('khedmah_runtime_role','khedmah_migration_role')
     AND (rolcanlogin OR NOT rolinherit OR rolcreaterole OR rolcreatedb OR rolsuper OR rolreplication OR rolbypassrls))
 OR (SELECT count(*) FROM pg_auth_members m
     JOIN pg_roles g ON g.oid=m.roleid JOIN pg_roles u ON u.oid=m.member
     WHERE g.rolname IN ('khedmah_app','khedmah_migrator','khedmah_runtime_role','khedmah_migration_role')
        OR u.rolname IN ('khedmah_app','khedmah_migrator','khedmah_runtime_role','khedmah_migration_role'))<>2
 OR NOT EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.roleid JOIN pg_roles u ON u.oid=m.member
     WHERE g.rolname='cloudsqlsuperuser' AND u.rolname='khedmah_app'
       AND m.inherit_option AND m.set_option AND NOT m.admin_option)
 OR NOT EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.roleid JOIN pg_roles u ON u.oid=m.member
     WHERE g.rolname='khedmah_migration_role' AND u.rolname='khedmah_migrator'
       AND m.inherit_option AND m.set_option AND NOT m.admin_option)
 OR EXISTS (SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole
     WHERE r.rolname IN ('khedmah_app','khedmah_migrator','khedmah_runtime_role','khedmah_migration_role'))),
 'catalog_unchanged', NOT (NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='khedmah'
     AND datdba=(SELECT oid FROM pg_roles WHERE rolname='cloudsqlsuperuser'))
 OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='public'
     AND nspowner=(SELECT oid FROM pg_roles WHERE rolname='pg_database_owner'))
 OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema'))
 OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema')
 OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema')
 OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema')
 OR EXISTS (SELECT 1 FROM pg_largeobject_metadata)
 OR NOT (  NOT EXISTS (
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
        AND owner_role.rolname='khedmah_migrator'
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
    SELECT 1 FROM pg_collation catalog_collation
    JOIN pg_namespace namespace ON namespace.oid=catalog_collation.collnamespace
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
  AND NOT EXISTS (SELECT 1 FROM pg_parameter_acl))),
 'migrator_defaults_ready', (
(SELECT count(*) FROM pg_default_acl)=1
AND EXISTS (
 SELECT 1 FROM pg_default_acl a
 WHERE a.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='khedmah_migrator')
 AND a.defaclnamespace=0 AND a.defaclobjtype='f'
 AND (SELECT count(*) FROM aclexplode(a.defaclacl))=1
 AND NOT EXISTS (SELECT 1 FROM aclexplode(a.defaclacl) p
   WHERE p.grantor<>a.defaclrole OR p.grantee<>a.defaclrole
     OR p.privilege_type<>'EXECUTE' OR p.is_grantable)
)),
 'staged_acl_ready', NOT (NOT (  NOT EXISTS (
    SELECT 1
    FROM pg_database database
    CROSS JOIN LATERAL aclexplode(database.datacl) privilege
    WHERE database.datname='khedmah'
      AND (
        privilege.grantee=0
        OR privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='khedmah_app')
      )
  )
  AND 1=(
    SELECT count(*)
    FROM pg_database database
    CROSS JOIN LATERAL aclexplode(database.datacl) privilege
    WHERE database.datname='khedmah'
      AND privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='khedmah_runtime_role')
      AND privilege.privilege_type='CONNECT'
      AND NOT privilege.is_grantable
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_database database
    CROSS JOIN LATERAL aclexplode(database.datacl) privilege
    WHERE database.datname='khedmah'
      AND privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='khedmah_runtime_role')
      AND (privilege.privilege_type<>'CONNECT' OR privilege.is_grantable)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_namespace namespace
    CROSS JOIN LATERAL aclexplode(namespace.nspacl) privilege
    WHERE namespace.nspname='public'
      AND (
        privilege.grantee=0
        OR privilege.grantee IN (
          SELECT oid FROM pg_roles WHERE rolname IN ('khedmah_app','khedmah_runtime_role')
        )
      )
  ))
      OR NOT has_database_privilege('khedmah_migration_role','khedmah','CONNECT WITH GRANT OPTION')
      OR NOT has_database_privilege('khedmah_migration_role','khedmah','CREATE WITH GRANT OPTION')
      OR NOT has_schema_privilege('khedmah_migration_role','public','USAGE WITH GRANT OPTION')
      OR NOT has_schema_privilege('khedmah_migration_role','public','CREATE WITH GRANT OPTION'))
);
ROLLBACK;
"""

def load_operator():
    path = Path(__file__).resolve().with_name("production-database-mixed-acl-prepare.py")
    if hashlib.sha256(path.read_bytes()).hexdigest() != OPERATOR_SHA256:
        raise ValueError("operator source changed")
    spec = importlib.util.spec_from_file_location("phase_a_operator", path)
    operator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(operator)
    return operator

def validate(record, user):
    if (not isinstance(record, dict)
            or record.get("database") != "khedmah"
            or record.get("current_user") != user
            or record.get("session_user") != user
            or record.get("read_only") != "on"
            or record.get("system_role_manifest_sha256") != EXPECTED_MANIFEST
            or any(record.get(key) is not True for key in CHECKS)
            or not isinstance(record.get("evidence_utc"), str)
            or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?", record["evidence_utc"])):
        raise ValueError("postflight not ready")
    keys = ("database", "current_user", "session_user", "read_only",
            "evidence_utc", "system_role_manifest_sha256", *CHECKS)
    return {key: record[key] for key in keys}

def run(operator):
    os.umask(0o077)
    reader, _ = operator.load_sources()
    operator.check_refs(reader)
    sql = SQL.replace("__MANIFEST__", reader.MANIFEST_SQL)
    with operator.connection() as (pgpass, proxy):
        for user in ("khedmah_migrator", "khedmah_app"):
            if proxy.poll() is not None:
                raise ValueError("proxy exited")
            record = json.loads(operator.sql_call(user, sql, pgpass, read_only=True))
            print(json.dumps(validate(record, user), sort_keys=True), flush=True)
        operator.check_refs(reader)
    print("PHASE_A_ACL_READBACK_VERIFIED_NO_MUTATION")
    print("RUNTIME_STILL_PRIVILEGED_CUTOVER_PENDING")

def main():
    try:
        run(load_operator())
    except (Exception, SystemExit, KeyboardInterrupt):
        print("STOP: Phase A readback not verified; details withheld; do not rerun the mutation.")
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
