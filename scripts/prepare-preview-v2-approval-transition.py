#!/usr/bin/env python3
"""Prepare the reviewed 025 -> 036 + 037 transaction offline; never execute it.

This module is a transaction core, not a Cloud SQL operator. The only CLI mode
prints source/SQL fingerprints and open execution gates, never runnable SQL.
Cloud identity, service binding, traffic compatibility, authority, commit
acknowledgment and fresh readback belong to a separately reviewed live operator.
Table locks and governed advisory locks do not exclude arbitrary concurrent DDL
by another owner/superuser. Such operations must be excluded by that operator.
"""
import hashlib
import json
from pathlib import Path
import re
import sys

PROJECT = 'khedmah-preview-v2-20261012'
DATABASE = 'khedmah'
SOURCE_PINS = {
    'runner': ('scripts/deployment/run-approval-prerequisites-035-037-nonproduction-migration.sh',
        'f10c40a51c23e1969c06d7281cdcfd7e0ea948ef',
        '248fad2079180ed751293a36709c4faf65f0872699576a651b8ab4c4d5340230'),
    '025': ('backend/migrations/versions/025_classifieds.sql',
        '83d1f28a54d85498ad2bfbf4974f37cdbf0b5d13',
        '0956abab007839d76e3aeca1d310835898e3b97bdc3adb784861f5fcd7c1cf5d'),
    '036': ('backend/migrations/versions/036_classifieds_rolling_publication_quota.sql',
        '1474509257144f938cbef7be7bddcc5cc1f00414',
        '8ed732624b0baf5f5457d138692622214fe2d7b2dd556b79974d23bd0c76093b'),
    '037': ('backend/migrations/versions/037_verification_evidence_media.sql',
        '71f86e7c500adfdcd4ca3f2fe8a3562f66374874',
        '2ff2dbac17a7606ced97cb332c52a431d6eb6ea6b35271906ff9984d14a7b216'),
}
BODY_025_SHA256 = '7cfb695387b6c31296461911d924da088d6232f8a2d901a5572e9e5003dd585b'
BODY_036_SHA256 = '3d1a27bcb76579aa290299609f015efb6c34094647ed11d8c7bd7ea3e270a002'
CTE_SHA256 = '78484298abedabcd657966015940039c8ed8cf66a79c3061871a699eec9f7c47'
CTE_START = 'WITH attributes AS ('
CTE_END = "SELECT classification='prerequisite-invalid' AS prerequisite_invalid,"


def stop(code):
    raise SystemExit('STOP: ' + code)


def verified_sources(sources):
    if not isinstance(sources, dict) or set(sources) != set(SOURCE_PINS):
        stop('OFFLINE_TRANSITION_SOURCE_SET_MISMATCH')
    for label, (_, blob, checksum) in SOURCE_PINS.items():
        data = sources[label]
        if (not isinstance(data, bytes)
                or hashlib.sha256(data).hexdigest() != checksum
                or hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() != blob):
            stop('OFFLINE_TRANSITION_SOURCE_BYTES_MISMATCH')
    return {label: data.decode('utf-8') for label, data in sources.items()}


def catalog_ctes(sources):
    text = verified_sources(sources)
    runner = text['runner']
    if runner.count(CTE_START) != 1 or runner.count(CTE_END) != 1:
        stop('OFFLINE_TRANSITION_CTE_BOUNDARY_MISMATCH')
    start, end = runner.index(CTE_START), runner.index(CTE_END)
    cte = runner[start:end]
    if end <= start or hashlib.sha256(cte.encode()).hexdigest() != CTE_SHA256:
        stop('OFFLINE_TRANSITION_CTE_CHECKSUM_MISMATCH')
    old = re.findall(r'CREATE FUNCTION enforce_ad_free_slot_limit\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$(.*?)\$\$;', text['025'], re.S)
    new = re.findall(r'CREATE OR REPLACE FUNCTION enforce_ad_free_slot_limit\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$(.*?)\$\$;', text['036'], re.S)
    if (len(old) != 1 or len(new) != 1
            or hashlib.sha256(old[0].encode()).hexdigest() != BODY_025_SHA256
            or hashlib.sha256(new[0].encode()).hexdigest() != BODY_036_SHA256
            or cte.count('AND p.prosrc=$quota$' + new[0] + '$quota$') != 1):
        stop('OFFLINE_TRANSITION_QUOTA_BODY_MISMATCH')
    # Every original metadata/trigger/rule predicate is retained. Only the exact
    # function body used by the predecessor classifier differs from the target.
    previous = cte.replace('AND p.prosrc=$quota$' + new[0] + '$quota$',
                           'AND p.prosrc=$quota$' + old[0] + '$quota$', 1)
    return previous, cte, text


PRESERVED_QUERY = """SELECT pg_catalog.jsonb_build_object(
 'relations',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'oid',c.oid,'name',c.relname,'owner',c.relowner,'acl',c.relacl::text)
   ORDER BY c.oid) FROM pg_catalog.pg_class c
   WHERE c.oid IN ('public.admin_roles'::regclass,'public.ad_free_slots'::regclass,
     'public.media_assets'::regclass,'public.food_promo_codes'::regclass,
     'public.food_promo_claims'::regclass,'public.mobility_document_reviews'::regclass)),
 'quota_function',(SELECT pg_catalog.jsonb_build_object(
   'oid',p.oid,'owner',p.proowner,'acl',p.proacl::text)
   FROM pg_catalog.pg_proc p WHERE p.oid='public.enforce_ad_free_slot_limit()'::regprocedure),
 'role_constraint',(SELECT pg_catalog.jsonb_build_object(
   'oid',c.oid,'definition',pg_catalog.pg_get_constraintdef(c.oid))
   FROM pg_catalog.pg_constraint c WHERE c.conrelid='public.admin_roles'::regclass
     AND c.conname='admin_roles_role_check'))"""


def build_transition_sql(sources):
    """Return an inert SQL candidate; never connect, spawn or write a file."""
    before, after, text = catalog_ctes(sources)
    return """-- OFFLINE CANDIDATE: cloud/traffic/authority gates are not proved by SQL.
BEGIN ISOLATION LEVEL READ COMMITTED, READ WRITE;
SET LOCAL statement_timeout='120s';
SET LOCAL lock_timeout='5s';
SET LOCAL idle_in_transaction_session_timeout='30s';
SET LOCAL search_path=pg_catalog;
DO $approval_transition$
DECLARE state_ok boolean; preserved_before jsonb; preserved_after jsonb;
BEGIN
 IF current_database()<>'khedmah' OR current_user<>'khedmah_migrator'
    OR session_user<>'khedmah_migrator'
    OR current_setting('transaction_read_only')<>'off'
    OR current_setting('transaction_isolation')<>'read committed'
    OR current_setting('server_version_num')::integer NOT BETWEEN 160000 AND 169999
    OR pg_catalog.pg_my_temp_schema()<>0
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
   RAISE EXCEPTION 'APPROVAL_TRANSITION_IDENTITY_MISMATCH';
 END IF;
 -- Nonblocking advisory acquisition avoids an unbounded governed-writer wait.
 IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
      'khedmah-nonproduction-classifieds-036',0)) THEN
   RAISE EXCEPTION 'APPROVAL_TRANSITION_GOVERNED_WRITER_BUSY';
 END IF;
 IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
      'khedmah-nonproduction-approval-prerequisites-035-037',0)) THEN
   RAISE EXCEPTION 'APPROVAL_TRANSITION_GOVERNED_WRITER_BUSY';
 END IF;
 LOCK TABLE public.ad_free_slots, public.media_assets IN ACCESS EXCLUSIVE MODE;
 LOCK TABLE public.admin_roles IN SHARE MODE;
 LOCK TABLE public.food_promo_codes, public.food_promo_claims,
   public.mobility_document_reviews IN ACCESS SHARE MODE;
 IF (SELECT count(*) FROM pg_catalog.pg_class c
     WHERE c.oid IN ('public.admin_roles'::regclass,'public.ad_free_slots'::regclass,
       'public.media_assets'::regclass,'public.food_promo_codes'::regclass,
       'public.food_promo_claims'::regclass,'public.mobility_document_reviews'::regclass)
       AND c.relkind='r' AND c.relpersistence='p' AND NOT c.relispartition
       AND NOT c.relrowsecurity AND NOT c.relforcerowsecurity
       AND pg_catalog.pg_get_userbyid(c.relowner)='khedmah_migrator')<>6
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_inherits
      WHERE inhrelid IN ('public.admin_roles'::regclass,'public.ad_free_slots'::regclass,
          'public.media_assets'::regclass)
         OR inhparent IN ('public.admin_roles'::regclass,'public.ad_free_slots'::regclass,
          'public.media_assets'::regclass)) THEN
   RAISE EXCEPTION 'APPROVAL_TRANSITION_RELATION_OWNER_OR_SHAPE_MISMATCH';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_event_trigger WHERE evtenabled<>'D') THEN
   RAISE EXCEPTION 'APPROVAL_TRANSITION_EVENT_TRIGGER_PRESENT';
 END IF;
""" + before + """SELECT classification='role-target' INTO state_ok FROM state;
 IF state_ok IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'APPROVAL_TRANSITION_PREDECESSOR_MISMATCH';
 END IF;
""" + PRESERVED_QUERY + """ INTO preserved_before;
 -- Omitting pg_catalog makes its lookup implicitly first, while public is
 -- the creation namespace for the unchanged unqualified canonical function.
 PERFORM pg_catalog.set_config('search_path','public',true);
 EXECUTE $migration036$""" + text['036'] + """$migration036$;
 EXECUTE $migration037$""" + text['037'] + """$migration037$;
 PERFORM pg_catalog.set_config('search_path','pg_catalog',true);
""" + after + """SELECT classification='target' INTO state_ok FROM state;
 IF state_ok IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'APPROVAL_TRANSITION_TARGET_MISMATCH';
 END IF;
""" + PRESERVED_QUERY + """ INTO preserved_after;
 IF preserved_after IS DISTINCT FROM preserved_before THEN
   RAISE EXCEPTION 'APPROVAL_TRANSITION_PRESERVED_METADATA_CHANGED';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_event_trigger WHERE evtenabled<>'D') THEN
   RAISE EXCEPTION 'APPROVAL_TRANSITION_EVENT_TRIGGER_PRESENT';
 END IF;
END $approval_transition$;
COMMIT;
"""


def prepare_plan(sources):
    sql = build_transition_sql(sources)
    return dict(stage='PREVIEW_V2_APPROVAL_TRANSITION_PREPARED_OFFLINE', project=PROJECT,
        database=DATABASE, migrations=['036', '037'], role_035_action='preserve_exact_target',
        source_pins={name: dict(git_blob=pin[1], sha256=pin[2]) for name, pin in SOURCE_PINS.items()},
        transaction_sql_sha256=hashlib.sha256(sql.encode()).hexdigest(),
        required_live_gates=['fixed_cloud_and_database_binding', 'separately_reviewed_live_operator',
            'separate_execution_authority', 'pinned_compatible_backend_image',
            'classifieds_maintenance_all_routes_traffic_tags_and_inflight_drained', 'governed_ddl_exclusion',
            'fresh_locked_predecessor', 'commit_acknowledgment_and_readback'],
        successor_startup_requires_037=True, constraint_validation_scans_existing_rows=True,
        execution_enabled=False, cloud_access_performed=False, database_access_performed=False,
        schema_mutation=False, role_mutation=False, acl_mutation=False,
        application_data_mutation=False, application_row_values_returned=False,
        application_deployment_performed=False,
        schema_readiness_verified=False, release_gates_verified=False)


def main(argv):
    if argv != ['--plan']:
        stop('USE_OFFLINE_PLAN_ONLY')
    root = Path(__file__).resolve().parents[1]
    try:
        sources = {name: (root / pin[0]).read_bytes() for name, pin in SOURCE_PINS.items()}
    except OSError:
        stop('OFFLINE_TRANSITION_SOURCE_UNAVAILABLE')
    print(json.dumps(prepare_plan(sources), sort_keys=True))


if __name__ == '__main__':
    main(sys.argv[1:])
