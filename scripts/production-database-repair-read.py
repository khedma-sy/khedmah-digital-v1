#!/usr/bin/env python3
"""Read-only repair evidence. Does not prepare, harden, mutate, or authorize repair.

Manifest and persistence SQL derive from production-database-role-bootstrap.sh,
reviewed main bc5a5c764413498189147cc34c7e857c78aa3d2c,
Git blob b50ca758c4142e47a13ce36a7b3e9d22b70b8c31.
The expected digest is the previously reviewed October 5 baseline, not a new
automatically approved baseline. A match does not authorize a Production write.
"""
import hashlib
import json
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path

PROJECT = "khedma-dl"
INSTANCE = "khedmah-v1-db"
CONNECTION = "khedma-dl:europe-west1:khedmah-v1-db"
EXPECTED_MANIFEST = "656ccf46a96a6ea32a3c0a9f3ea8ced8a266390b544d2cee6dbbb221a2e614cf"
DATABASES = ("khedmah", "postgres", "template1")
MANIFEST_SQL = "WITH application_role(rolname) AS (\n  VALUES\n    ('khedmah_app'),\n    ('khedmah_migrator'),\n    ('khedmah_runtime_role'),\n    ('khedmah_migration_role')\n), manifest(line) AS (\n  SELECT concat_ws(\n    '|', 'R', role.oid::text,\n    encode(convert_to(role.rolname, 'UTF8'), 'hex'),\n    role.rolsuper::integer::text,\n    role.rolinherit::integer::text,\n    role.rolcreaterole::integer::text,\n    role.rolcreatedb::integer::text,\n    role.rolcanlogin::integer::text,\n    role.rolreplication::integer::text,\n    role.rolconnlimit::text,\n    COALESCE(extract(epoch FROM role.rolvaliduntil)::text, '-'),\n    role.rolbypassrls::integer::text,\n    encode(convert_to(COALESCE(array_to_string(role.rolconfig, chr(31)), ''), 'UTF8'), 'hex')\n  )\n  FROM pg_roles role\n  WHERE NOT EXISTS (\n    SELECT 1 FROM application_role expected WHERE expected.rolname=role.rolname\n  )\n  UNION ALL\n  SELECT concat_ws(\n    '|', 'M',\n    encode(convert_to(granted_role.rolname, 'UTF8'), 'hex'),\n    encode(convert_to(member_role.rolname, 'UTF8'), 'hex'),\n    encode(convert_to(grantor_role.rolname, 'UTF8'), 'hex'),\n    membership.admin_option::integer::text,\n    membership.inherit_option::integer::text,\n    membership.set_option::integer::text\n  )\n  FROM pg_auth_members membership\n  JOIN pg_roles granted_role ON granted_role.oid=membership.roleid\n  JOIN pg_roles member_role ON member_role.oid=membership.member\n  JOIN pg_roles grantor_role ON grantor_role.oid=membership.grantor\n  WHERE NOT EXISTS (\n    SELECT 1 FROM application_role expected\n    WHERE expected.rolname IN (granted_role.rolname, member_role.rolname)\n  )\n  UNION ALL\n  SELECT concat_ws(\n    '|', 'S',\n    COALESCE(encode(convert_to(configured_role.rolname, 'UTF8'), 'hex'), '0'),\n    settings.setdatabase::text,\n    encode(convert_to(array_to_string(settings.setconfig, chr(31)), 'UTF8'), 'hex')\n  )\n  FROM pg_db_role_setting settings\n  LEFT JOIN pg_roles configured_role ON configured_role.oid=settings.setrole\n  WHERE settings.setrole=0 OR NOT EXISTS (\n    SELECT 1 FROM application_role expected WHERE expected.rolname=configured_role.rolname\n  )\n  UNION ALL\n  SELECT concat_ws(\n    '|', 'D', database.oid::text,\n    encode(convert_to(database.datname, 'UTF8'), 'hex'),\n    encode(convert_to(owner_role.rolname, 'UTF8'), 'hex'),\n    database.encoding::text,\n    encode(convert_to(database.datcollate, 'UTF8'), 'hex'),\n    encode(convert_to(database.datctype, 'UTF8'), 'hex'),\n    database.datistemplate::integer::text,\n    database.datallowconn::integer::text,\n    database.datconnlimit::text,\n    encode(convert_to(tablespace.spcname, 'UTF8'), 'hex'),\n    CASE\n      WHEN database.datname='khedmah' THEN '-'\n      ELSE encode(\n        convert_to(COALESCE(array_to_string(database.datacl, chr(31)), ''), 'UTF8'),\n        'hex'\n      )\n    END\n  )\n  FROM pg_database database\n  JOIN pg_roles owner_role ON owner_role.oid=database.datdba\n  JOIN pg_tablespace tablespace ON tablespace.oid=database.dattablespace\n)\nSELECT line FROM manifest ORDER BY line"
FOOTPRINT_SQL = "\nSELECT json_build_object(\n  'database', current_database(),\n  'current_user', current_user,\n  'session_user', session_user,\n  'read_only', current_setting('transaction_read_only'),\n  'evidence_utc', clock_timestamp() AT TIME ZONE 'UTC',\n  'global_persistence_clear', (  NOT EXISTS (\n    SELECT 1\n    FROM pg_proc routine\n    JOIN pg_namespace namespace ON namespace.oid=routine.pronamespace\n    JOIN pg_roles owner_role ON owner_role.oid=routine.proowner\n    JOIN pg_language language ON language.oid=routine.prolang\n    WHERE namespace.nspname !~ '^pg_'\n      AND namespace.nspname <> 'information_schema'\n      AND routine.prosecdef\n      AND NOT (\n        routine.oid IS NOT DISTINCT FROM to_regprocedure('khedmah_taxi.resolve_actor_locked(text,boolean)')\n        AND owner_role.rolname='khedmah_migrator'\n        AND language.lanname='plpgsql'\n        AND routine.prokind='f'\n        AND routine.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']::text[]\n      )\n  )\n  AND current_setting('max_prepared_transactions')::integer=0\n  AND NOT EXISTS (SELECT 1 FROM pg_foreign_server)\n  AND NOT EXISTS (SELECT 1 FROM pg_foreign_data_wrapper)\n  AND NOT EXISTS (SELECT 1 FROM pg_user_mappings)\n  AND NOT EXISTS (SELECT 1 FROM pg_event_trigger)\n  AND NOT EXISTS (SELECT 1 FROM pg_publication)\n  AND NOT EXISTS (SELECT 1 FROM pg_subscription)\n  AND NOT EXISTS (SELECT 1 FROM pg_prepared_xacts)\n  AND NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql')\n  AND NOT EXISTS (SELECT 1 FROM pg_cast WHERE oid >= 16384)\n  AND NOT EXISTS (\n    SELECT 1 FROM pg_language\n    WHERE lanname NOT IN ('internal','c','sql','plpgsql')\n  )\n  AND NOT EXISTS (\n    SELECT 1 FROM pg_operator operator\n    JOIN pg_namespace namespace ON namespace.oid=operator.oprnamespace\n    WHERE namespace.nspname !~ '^pg_'\n      AND namespace.nspname <> 'information_schema'\n  )\n  AND NOT EXISTS (\n    SELECT 1 FROM pg_collation catalog_collation\n    JOIN pg_namespace namespace ON namespace.oid=catalog_collation.collnamespace\n    WHERE namespace.nspname !~ '^pg_'\n      AND namespace.nspname <> 'information_schema'\n  )\n  AND NOT EXISTS (\n    SELECT 1 FROM pg_conversion conversion\n    JOIN pg_namespace namespace ON namespace.oid=conversion.connamespace\n    WHERE namespace.nspname !~ '^pg_'\n      AND namespace.nspname <> 'information_schema'\n  )\n  AND NOT EXISTS (\n    SELECT 1 FROM pg_ts_config configuration\n    JOIN pg_namespace namespace ON namespace.oid=configuration.cfgnamespace\n    WHERE namespace.nspname !~ '^pg_'\n      AND namespace.nspname <> 'information_schema'\n  )\n  AND NOT EXISTS (\n    SELECT 1 FROM pg_ts_dict dictionary\n    JOIN pg_namespace namespace ON namespace.oid=dictionary.dictnamespace\n    WHERE namespace.nspname !~ '^pg_'\n      AND namespace.nspname <> 'information_schema'\n  )\n  AND NOT EXISTS (\n    SELECT 1 FROM pg_ts_parser parser\n    JOIN pg_namespace namespace ON namespace.oid=parser.prsnamespace\n    WHERE namespace.nspname !~ '^pg_'\n      AND namespace.nspname <> 'information_schema'\n  )\n  AND NOT EXISTS (\n    SELECT 1 FROM pg_ts_template template\n    JOIN pg_namespace namespace ON namespace.oid=template.tmplnamespace\n    WHERE namespace.nspname !~ '^pg_'\n      AND namespace.nspname <> 'information_schema'\n  )\n  AND NOT EXISTS (\n    SELECT 1 FROM pg_opclass operator_class\n    JOIN pg_namespace namespace ON namespace.oid=operator_class.opcnamespace\n    WHERE namespace.nspname !~ '^pg_'\n      AND namespace.nspname <> 'information_schema'\n  )\n  AND NOT EXISTS (\n    SELECT 1 FROM pg_opfamily operator_family\n    JOIN pg_namespace namespace ON namespace.oid=operator_family.opfnamespace\n    WHERE namespace.nspname !~ '^pg_'\n      AND namespace.nspname <> 'information_schema'\n  )\n  AND NOT EXISTS (SELECT 1 FROM pg_transform)\n  AND NOT EXISTS (SELECT 1 FROM pg_parameter_acl)),\n  'extra_non_system_schemas', (SELECT count(*) FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema','public')),\n  'non_system_relations', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'),\n  'non_system_routines', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'),\n  'non_system_types', (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'),\n  'large_objects', (SELECT count(*) FROM pg_largeobject_metadata),\n  'default_acl_rows', (SELECT count(*) FROM pg_default_acl),\n  'application_owned_objects', (SELECT count(*) FROM pg_shdepend s JOIN pg_roles r ON r.oid=s.refobjid WHERE s.refclassid='pg_authid'::regclass AND s.dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND s.deptype='o' AND r.rolname IN ('khedmah_app','khedmah_migrator','khedmah_runtime_role','khedmah_migration_role')),\n  'application_acl_dependencies', (SELECT count(*) FROM pg_shdepend s JOIN pg_roles r ON r.oid=s.refobjid WHERE s.refclassid='pg_authid'::regclass AND s.dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND s.deptype='a' AND r.rolname IN ('khedmah_app','khedmah_migrator','khedmah_runtime_role','khedmah_migration_role'))\n);\n"

def stop(message):
    raise SystemExit("STOP: " + message)

def cloud(*args):
    result = subprocess.run(
        ["gcloud", *args, "--project=" + PROJECT, "--verbosity=error"],
        capture_output=True, text=True, timeout=60,
        env=dict(os.environ, CLOUDSDK_CORE_LOG_HTTP="false"))
    if result.returncode:
        stop("Google read failed; sensitive details withheld.")
    return result.stdout

def check_secret():
    metadata = json.loads(cloud("secrets", "describe", "DATABASE_MIGRATION_URL", "--format=json"))
    if str(metadata.get("versionAliases", {}).get("active", "")) != "2":
        stop("migration active alias changed.")
    version = json.loads(cloud("secrets", "versions", "describe", "2",
                              "--secret=DATABASE_MIGRATION_URL", "--format=json"))
    if (version.get("name") != "projects/311026134906/secrets/DATABASE_MIGRATION_URL/versions/2"
            or version.get("state") != "ENABLED"):
        stop("migration version 2 is not the expected enabled version.")

def query(database, sql, pgpass):
    if database not in DATABASES:
        stop("unexpected database target.")
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    env.update(PGPASSFILE=str(pgpass), PGCONNECT_TIMEOUT="10", PGSSLMODE="disable",
               PGOPTIONS="-c role=none -c search_path=pg_catalog -c default_transaction_read_only=on")
    statement = ("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
                 "SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s';\n"
                 + sql + "\nROLLBACK;\n")
    result = subprocess.run(
        ["psql", "-X", "-w", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", "19474",
         "-U", "khedmah_migrator", "-d", database, "-v", "ON_ERROR_STOP=1", "-P", "pager=off"],
        input=statement, text=True, capture_output=True, env=env, timeout=120)
    if result.returncode:
        stop("catalog read failed in " + database + "; sensitive details withheld.")
    return result.stdout

def run():
    os.umask(0o077)
    instance = json.loads(cloud("sql", "instances", "describe", INSTANCE, "--format=json"))
    if (instance.get("connectionName") != CONNECTION or instance.get("state") != "RUNNABLE"
            or instance.get("databaseVersion") != "POSTGRES_16"):
        stop("instance identity, state, or PostgreSQL version changed.")
    check_secret()
    raw = cloud("secrets", "versions", "access", "2", "--secret=DATABASE_MIGRATION_URL")
    match = re.fullmatch(r"postgres(?:ql)?://khedmah_migrator:([0-9a-f]{64})@localhost/khedmah", raw.strip())
    if not match:
        stop("migration credential format changed; value withheld.")
    with tempfile.TemporaryDirectory(prefix="khedmah-repair-read-") as folder:
        root = Path(folder)
        pgpass = root / "pgpass"
        pgpass.write_text("".join(
            "127.0.0.1:19474:" + db + ":khedmah_migrator:" + match.group(1) + "\n"
            for db in DATABASES))
        pgpass.chmod(0o600)
        del raw, match
        log = root / "proxy.log"
        with log.open("w") as output:
            proxy = subprocess.Popen(
                ["/usr/bin/cloud-sql-proxy", CONNECTION, "--address=127.0.0.1", "--port=19474"],
                stdout=output, stderr=subprocess.STDOUT)
            try:
                deadline = time.monotonic() + 45
                while "ready for new connections" not in log.read_text().lower():
                    if proxy.poll() is not None or time.monotonic() >= deadline:
                        stop("proxy not ready; no complete evidence.")
                    time.sleep(0.5)
                if proxy.poll() is not None:
                    stop("proxy exited before catalog reads.")
                records = query("khedmah", MANIFEST_SQL + ";", pgpass).splitlines()
                if not records or any(not re.fullmatch(r"[RMSD]\|[0-9a-fA-F|.,:+_\-]*", line) for line in records):
                    stop("manifest response malformed; values withheld.")
                manifest = "\n".join(records) + "\n"
                digest = hashlib.sha256(manifest.encode("utf-8")).hexdigest()
                print("SYSTEM_ROLE_MANIFEST_SHA256=" + digest, flush=True)
                print("REVIEWED_MANIFEST_MATCH=" + str(digest == EXPECTED_MANIFEST).lower(), flush=True)
                print("SYSTEM_ROLE_MANIFEST_RECORD_COUNT=" + str(len(records)), flush=True)
                del manifest, records
                clear = True
                counts = ("extra_non_system_schemas", "non_system_relations",
                          "non_system_routines", "non_system_types", "large_objects",
                          "default_acl_rows", "application_owned_objects",
                          "application_acl_dependencies")
                for database in DATABASES:
                    evidence = json.loads(query(database, FOOTPRINT_SQL, pgpass))
                    if (evidence.get("database") != database
                            or evidence.get("current_user") != "khedmah_migrator"
                            or evidence.get("session_user") != "khedmah_migrator"
                            or evidence.get("read_only") != "on"
                            or type(evidence.get("global_persistence_clear")) is not bool
                            or any(type(evidence.get(key)) is not int or evidence[key] < 0 for key in counts)):
                        stop("unexpected catalog response; values withheld.")
                    safe_keys = ("database", "current_user", "session_user", "read_only", "evidence_utc",
                                 "global_persistence_clear", *counts)
                    print(json.dumps({key: evidence.get(key) for key in safe_keys}, sort_keys=True), flush=True)
                    clear = clear and evidence["global_persistence_clear"] and all(
                        evidence[key] == 0 for key in counts if key != "application_acl_dependencies")
                    if database != "khedmah":
                        clear = clear and evidence["application_acl_dependencies"] == 0
                check_secret()
                if digest != EXPECTED_MANIFEST:
                    stop("system-role manifest differs from the reviewed baseline; do not repair.")
                if not clear:
                    stop("catalog footprint differs from the observed empty-state expectation; do not repair.")
                print("PRODUCTION_REPAIR_READ_COMPLETED_NO_MUTATION")
                print("NOT_A_PRODUCTION_REPAIR_APPROVAL")
            finally:
                if proxy.poll() is None:
                    proxy.terminate()
                    try:
                        proxy.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        proxy.kill()
                        proxy.wait()

if __name__ == "__main__":
    try:
        run()
    except Exception:
        stop("read failed; sensitive details withheld.")
