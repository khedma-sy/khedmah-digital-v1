-- Phase A only. Run first as khedmah_migrator, then as khedmah_app.
-- Requires a fresh successful operation-specific backup and explicit owner
-- approval enforced by the accompanying Python operator.
-- No role membership/attribute/password changes, restart, schema or data DDL.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-production-schema-change', 0));
DO $repair$
BEGIN
 IF current_database()<>'khedmah'
   OR current_user NOT IN ('khedmah_app','khedmah_migrator')
   OR current_user<>session_user
   OR current_setting('server_version_num')::integer / 10000 <> 16 THEN
   RAISE EXCEPTION 'REPAIR_IDENTITY_MISMATCH';
 END IF;
 IF (WITH application_role(rolname) AS (
  VALUES
    ('khedmah_app'),
    ('khedmah_migrator'),
    ('khedmah_runtime_role'),
    ('khedmah_migration_role')
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
      WHEN database.datname='khedmah' THEN '-'
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
SELECT encode(sha256(convert_to(string_agg(line, E'\n' ORDER BY line) || E'\n', 'UTF8')), 'hex') FROM manifest) IS DISTINCT FROM
    '656ccf46a96a6ea32a3c0a9f3ea8ced8a266390b544d2cee6dbbb221a2e614cf' THEN
   RAISE EXCEPTION 'REPAIR_SYSTEM_MANIFEST_MISMATCH';
 END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN
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
     WHERE r.rolname IN ('khedmah_app','khedmah_migrator','khedmah_runtime_role','khedmah_migration_role')) THEN
   RAISE EXCEPTION 'REPAIR_MIXED_ROLE_STATE_CHANGED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='khedmah'
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
  AND NOT EXISTS (SELECT 1 FROM pg_parameter_acl)) THEN
   RAISE EXCEPTION 'REPAIR_CATALOG_NOT_EMPTY_OR_TRUSTED';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) p
     WHERE d.datname='khedmah' AND p.grantee<>0 AND p.grantee NOT IN
       (SELECT oid FROM pg_roles WHERE rolname IN ('cloudsqlsuperuser','khedmah_runtime_role','khedmah_migration_role')))
 OR EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) p
     WHERE n.nspname='public' AND p.grantee<>0 AND p.grantee NOT IN
       (SELECT oid FROM pg_roles WHERE rolname IN ('pg_database_owner','cloudsqlsuperuser','khedmah_runtime_role','khedmah_migration_role')))
 OR EXISTS (SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) p
     LEFT JOIN pg_roles r ON r.oid=p.grantee
     WHERE d.datname='khedmah' AND (
       (p.grantee=0 AND (p.privilege_type NOT IN ('CONNECT','TEMPORARY') OR p.is_grantable))
       OR (r.rolname='khedmah_runtime_role' AND (p.privilege_type<>'CONNECT' OR p.is_grantable))
       OR (r.rolname='khedmah_migration_role' AND p.privilege_type NOT IN ('CONNECT','CREATE'))))
 OR EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) p
     LEFT JOIN pg_roles r ON r.oid=p.grantee
     WHERE n.nspname='public' AND (p.grantee=0 OR r.rolname='khedmah_runtime_role')
       AND (p.privilege_type<>'USAGE' OR p.is_grantable))
 OR NOT ((SELECT count(*) FROM pg_default_acl)=0 OR (
(SELECT count(*) FROM pg_default_acl)=1
AND EXISTS (
 SELECT 1 FROM pg_default_acl a
 WHERE a.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='khedmah_migrator')
 AND a.defaclnamespace=0 AND a.defaclobjtype='f'
 AND (SELECT count(*) FROM aclexplode(a.defaclacl))=1
 AND NOT EXISTS (SELECT 1 FROM aclexplode(a.defaclacl) p
   WHERE p.grantor<>a.defaclrole OR p.grantee<>a.defaclrole
     OR p.privilege_type<>'EXECUTE' OR p.is_grantable)
))) THEN
   RAISE EXCEPTION 'REPAIR_UNEXPECTED_ACL';
 END IF;

 IF current_user='khedmah_migrator' THEN
   ALTER DEFAULT PRIVILEGES REVOKE ALL ON ROUTINES FROM PUBLIC;
   IF NOT (
(SELECT count(*) FROM pg_default_acl)=1
AND EXISTS (
 SELECT 1 FROM pg_default_acl a
 WHERE a.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='khedmah_migrator')
 AND a.defaclnamespace=0 AND a.defaclobjtype='f'
 AND (SELECT count(*) FROM aclexplode(a.defaclacl))=1
 AND NOT EXISTS (SELECT 1 FROM aclexplode(a.defaclacl) p
   WHERE p.grantor<>a.defaclrole OR p.grantee<>a.defaclrole
     OR p.privilege_type<>'EXECUTE' OR p.is_grantable)
)) THEN
     RAISE EXCEPTION 'REPAIR_MIGRATOR_DEFAULTS_NOT_READY';
   END IF;
 ELSE
   IF NOT (
(SELECT count(*) FROM pg_default_acl)=1
AND EXISTS (
 SELECT 1 FROM pg_default_acl a
 WHERE a.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='khedmah_migrator')
 AND a.defaclnamespace=0 AND a.defaclobjtype='f'
 AND (SELECT count(*) FROM aclexplode(a.defaclacl))=1
 AND NOT EXISTS (SELECT 1 FROM aclexplode(a.defaclacl) p
   WHERE p.grantor<>a.defaclrole OR p.grantee<>a.defaclrole
     OR p.privilege_type<>'EXECUTE' OR p.is_grantable)
)) THEN
     RAISE EXCEPTION 'REPAIR_RUN_MIGRATOR_STAGE_FIRST';
   END IF;
   REVOKE ALL PRIVILEGES ON DATABASE khedmah FROM PUBLIC;
   REVOKE ALL PRIVILEGES ON DATABASE khedmah FROM khedmah_app;
   REVOKE CREATE, TEMPORARY ON DATABASE khedmah FROM khedmah_runtime_role;
   GRANT CONNECT ON DATABASE khedmah TO khedmah_runtime_role;
   GRANT CONNECT, CREATE ON DATABASE khedmah TO khedmah_migration_role WITH GRANT OPTION;
   REVOKE ALL ON SCHEMA public FROM PUBLIC, khedmah_app, khedmah_runtime_role;
   GRANT USAGE, CREATE ON SCHEMA public TO khedmah_migration_role WITH GRANT OPTION;
   IF NOT (  NOT EXISTS (
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
      OR NOT has_schema_privilege('khedmah_migration_role','public','CREATE WITH GRANT OPTION') THEN
     RAISE EXCEPTION 'REPAIR_STAGED_ACL_NOT_READY';
   END IF;
 END IF;
END
$repair$;
COMMIT;
