-- Read-only Phase B checks derived from the unchanged production role runner.
-- Substitute only a validated numeric __RESTART_MILLIS__ marker.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=pg_catalog;
SELECT json_build_object(
 'database', current_database(), 'current_user', current_user,
 'session_user', session_user, 'read_only', current_setting('transaction_read_only'),
 'evidence_utc', clock_timestamp() AT TIME ZONE 'UTC',
 'restart_proven', (
   to_timestamp(__RESTART_MILLIS__::numeric / 1000) <= clock_timestamp()
   AND to_timestamp(__RESTART_MILLIS__::numeric / 1000) >= clock_timestamp() - interval '1 hour'
   AND pg_postmaster_start_time() > to_timestamp(__RESTART_MILLIS__::numeric / 1000)),
 'system_role_manifest_sha256',
 (SELECT encode(sha256(convert_to(string_agg(line, E'\n' ORDER BY line) || E'\n', 'UTF8')), 'hex')
  FROM (WITH application_role(rolname) AS (
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
SELECT line FROM manifest ORDER BY line) AS manifest),
 'role_isolation', (current_database()<>'khedmah' OR (NOT EXISTS (
    SELECT 1
    FROM pg_roles role
    WHERE role.rolcanlogin
      AND role.rolname NOT IN (
        'khedmah_app', 'khedmah_migrator', 'postgres',
        'cloudsqladmin', 'cloudsqlagent', 'cloudsqlconnpooladmin',
        'cloudsqlimportexport', 'cloudsqllogical', 'cloudsqlsuperuser',
        'cloudsqlobservability', 'cloudsqlreplica'
      )
  )

  AND 
  NOT EXISTS (
    SELECT 1
    FROM pg_database database
    WHERE database.datname NOT IN ('cloudsqladmin','postgres','template0','template1','khedmah')
      AND NOT (false)
  )

  AND
  NOT pg_has_role('khedmah_app','cloudsqlsuperuser','member')
  AND NOT pg_has_role('khedmah_migrator','cloudsqlsuperuser','member')
  AND pg_has_role('khedmah_app','khedmah_runtime_role','usage')
  AND pg_has_role('khedmah_migrator','khedmah_migration_role','usage')
  AND NOT pg_has_role('khedmah_app','khedmah_runtime_role','member with admin option')
  AND NOT pg_has_role('khedmah_migrator','khedmah_migration_role','member with admin option')
  AND NOT pg_has_role('khedmah_app','khedmah_migration_role','member')
  AND NOT pg_has_role('khedmah_migrator','khedmah_runtime_role','member')
  AND EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='khedmah_app'
      AND rolcanlogin AND rolinherit
      AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls
  )
  AND EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='khedmah_migrator'
      AND rolcanlogin AND rolinherit
      AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls
  )
  AND EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='khedmah_runtime_role'
      AND NOT rolcanlogin AND rolinherit
      AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls
  )
  AND EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='khedmah_migration_role'
      AND NOT rolcanlogin AND rolinherit
      AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls
  )
  AND EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid=membership.roleid
    JOIN pg_roles member_role ON member_role.oid=membership.member
    WHERE granted_role.rolname='khedmah_runtime_role'
      AND member_role.rolname='khedmah_app'
      AND membership.inherit_option
      AND NOT membership.admin_option
  )
  AND EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid=membership.roleid
    JOIN pg_roles member_role ON member_role.oid=membership.member
    WHERE granted_role.rolname='khedmah_migration_role'
      AND member_role.rolname='khedmah_migrator'
      AND membership.inherit_option
      AND NOT membership.admin_option
  )
  AND 1 = (
    SELECT count(*)
    FROM pg_auth_members membership
    JOIN pg_roles member_role ON member_role.oid=membership.member
    WHERE member_role.rolname='khedmah_app'
  )
  AND 1 = (
    SELECT count(*)
    FROM pg_auth_members membership
    JOIN pg_roles member_role ON member_role.oid=membership.member
    WHERE member_role.rolname='khedmah_migrator'
  )
  AND 2 = (
    SELECT count(*)
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid=membership.roleid
    WHERE granted_role.rolname IN ('khedmah_runtime_role', 'khedmah_migration_role')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles member_role ON member_role.oid=membership.member
    WHERE member_role.rolname IN ('khedmah_runtime_role', 'khedmah_migration_role')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid=membership.roleid
    WHERE granted_role.rolname IN ('khedmah_app', 'khedmah_migrator')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_namespace namespace
    WHERE namespace.nspname='khedmah_app'
  )
  AND 
  NOT EXISTS (
    SELECT 1
    FROM pg_db_role_setting settings
    JOIN pg_roles configured_role ON configured_role.oid=settings.setrole
    WHERE configured_role.rolname IN ('khedmah_app','khedmah_migrator')
  )

  AND 
  1=(
    SELECT count(*)
    FROM pg_default_acl defaults
    WHERE defaults.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='khedmah_migrator')
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
    WHERE defaults.defaclrole<>(SELECT oid FROM pg_roles WHERE rolname='khedmah_migrator')
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
        WHERE defaults.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='khedmah_migrator')
          AND namespace.nspname='public'
          AND defaults.defaclobjtype='S'
          AND 2=(
            SELECT count(*)
            FROM aclexplode(defaults.defaclacl) privilege
          )
          AND EXISTS (
            SELECT 1
            FROM aclexplode(defaults.defaclacl) privilege
            WHERE privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='khedmah_runtime_role')
              AND privilege.grantor=defaults.defaclrole
              AND privilege.privilege_type='USAGE'
              AND NOT privilege.is_grantable
          )
          AND EXISTS (
            SELECT 1
            FROM aclexplode(defaults.defaclacl) privilege
            WHERE privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname='khedmah_runtime_role')
              AND privilege.grantor=defaults.defaclrole
              AND privilege.privilege_type='SELECT'
              AND NOT privilege.is_grantable
          )
          AND NOT EXISTS (
            SELECT 1
            FROM aclexplode(defaults.defaclacl) privilege
            WHERE privilege.grantee<>(SELECT oid FROM pg_roles WHERE rolname='khedmah_runtime_role')
              OR privilege.grantor<>defaults.defaclrole
              OR privilege.privilege_type NOT IN ('USAGE','SELECT')
              OR privilege.is_grantable
          )
      )
    )
  )

  AND 
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
  AND 
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
  AND NOT EXISTS (SELECT 1 FROM pg_parameter_acl)


  AND has_database_privilege('khedmah_runtime_role','khedmah','CONNECT')
  AND has_database_privilege('khedmah_migration_role','khedmah','CONNECT WITH GRANT OPTION')
  AND has_database_privilege('khedmah_migration_role','khedmah','CREATE WITH GRANT OPTION')
  AND has_schema_privilege('khedmah_migration_role','public','USAGE WITH GRANT OPTION')
  AND has_schema_privilege('khedmah_migration_role','public','CREATE WITH GRANT OPTION')
  AND has_database_privilege('khedmah_migrator','khedmah','CONNECT WITH GRANT OPTION')
  AND has_database_privilege('khedmah_migrator','khedmah','CREATE WITH GRANT OPTION')
  AND has_schema_privilege('khedmah_migrator','public','USAGE WITH GRANT OPTION')
  AND has_schema_privilege('khedmah_migrator','public','CREATE WITH GRANT OPTION')
  AND 
  NOT has_database_privilege('khedmah_app','khedmah','CREATE')
  AND NOT has_database_privilege('khedmah_app','khedmah','TEMPORARY')
  AND NOT has_database_privilege('khedmah_runtime_role','khedmah','CREATE')
  AND NOT has_database_privilege('khedmah_runtime_role','khedmah','TEMPORARY')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_database database
    CROSS JOIN LATERAL aclexplode(database.datacl) privilege
    WHERE database.datname='khedmah'
      AND privilege.grantee=0
  )

  AND NOT has_schema_privilege('khedmah_app','public','CREATE'))),
 'prebaseline_fresh', (
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
  AND NOT has_database_privilege('khedmah_app',current_database(),'CREATE')
  AND NOT has_database_privilege('khedmah_runtime_role',current_database(),'CREATE')
  AND NOT has_schema_privilege('khedmah_app','public','CREATE')
  AND NOT has_schema_privilege('khedmah_runtime_role','public','CREATE')
  AND (
    current_database()='khedmah'
    OR (
      NOT EXISTS (
        SELECT 1
        FROM pg_database database
        WHERE database.datname=current_database()
          AND database.datdba IN (
            SELECT oid FROM pg_roles
            WHERE rolname IN (
              'khedmah_app','khedmah_runtime_role','khedmah_migrator','khedmah_migration_role'
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
              'khedmah_app','khedmah_runtime_role','khedmah_migrator','khedmah_migration_role'
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
              'khedmah_app','khedmah_runtime_role','khedmah_migrator','khedmah_migration_role'
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
              'khedmah_app','khedmah_runtime_role','khedmah_migrator','khedmah_migration_role'
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
      current_database()='khedmah'
      AND 1=(SELECT count(*) FROM pg_default_acl)
      AND EXISTS (
        SELECT 1
        FROM pg_default_acl defaults
        WHERE defaults.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='khedmah_migrator')
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
      current_database()<>'khedmah'
      AND NOT EXISTS (SELECT 1 FROM pg_default_acl)
    )
  )
  AND 
  NOT EXISTS (SELECT 1 FROM pg_largeobject_metadata)
  AND 
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
  AND NOT EXISTS (SELECT 1 FROM pg_parameter_acl)


),
 'runtime_footprint_clear', (
  NOT EXISTS (
    SELECT 1
    FROM pg_roles runtime_identity
    WHERE runtime_identity.rolname IN ('khedmah_app','khedmah_runtime_role')
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
),
 'instance_inventory_safe', (
  NOT EXISTS (
    SELECT 1
    FROM pg_roles role
    WHERE role.rolcanlogin
      AND role.rolname NOT IN (
        'khedmah_app', 'khedmah_migrator', 'postgres',
        'cloudsqladmin', 'cloudsqlagent', 'cloudsqlconnpooladmin',
        'cloudsqlimportexport', 'cloudsqllogical', 'cloudsqlsuperuser',
        'cloudsqlobservability', 'cloudsqlreplica'
      )
  )
 AND 
  NOT EXISTS (
    SELECT 1
    FROM pg_database database
    WHERE database.datname NOT IN ('cloudsqladmin','postgres','template0','template1','khedmah')
      AND NOT (false)
  )
)
);
ROLLBACK;
