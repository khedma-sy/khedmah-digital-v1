// Optional SQL semantics laboratory, not a native PostgreSQL 16 acceptance test.
// Set KHEDMAH_PGLITE_MODULE to the installed @electric-sql/pglite 0.5.9 module.
// This test creates only a temporary local database and never uses cloud credentials.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const modulePath=process.env.KHEDMAH_PGLITE_MODULE;
test('Preview grant SQL: atomic rollback, exact ACL, schema preservation and replay rejection',
 {skip: !modulePath, timeout: 120000}, async () => {
  const { PGlite }=await import(pathToFileURL(path.resolve(modulePath)).href);
  const result=spawnSync('python3',[fileURLToPath(new URL('./test_preview_v2_runtime_grants.py',import.meta.url)),
    '--sql-lab-pack'],{encoding:'utf8',maxBuffer:2*1024*1024});
  assert.equal(result.status,0,result.stderr);
  const pack=JSON.parse(result.stdout);
  const dir=await mkdtemp(path.join(tmpdir(),'khedmah-acl-sql-'));
  let db;
  try {
    db=await PGlite.create(dir);
    const version=(await db.query('SHOW server_version_num')).rows[0].server_version_num;
    assert.ok(Number(version)>=180000 && Number(version)<190000,'This optional lab expects PG18 WASM.');
    await db.exec('CREATE ROLE cloudsqlsuperuser NOLOGIN;');
    await db.exec('CREATE DATABASE khedmah OWNER cloudsqlsuperuser;');
    await db.close();db=await PGlite.create(dir,{database:'khedmah'});
    await db.exec(`
      CREATE ROLE khedmah_runtime_role NOLOGIN;
      CREATE ROLE khedmah_migration_role NOLOGIN;
      CREATE ROLE khedmah_app LOGIN;
      CREATE ROLE khedmah_migrator LOGIN;
      GRANT khedmah_runtime_role TO khedmah_app;
      GRANT khedmah_migration_role TO khedmah_migrator;
      REVOKE ALL ON DATABASE khedmah FROM PUBLIC;
      GRANT CONNECT ON DATABASE khedmah TO khedmah_runtime_role,khedmah_migration_role;
      GRANT CREATE ON DATABASE khedmah TO khedmah_migration_role;
      REVOKE ALL ON SCHEMA public FROM PUBLIC;
      GRANT USAGE ON SCHEMA public TO khedmah_runtime_role;
      GRANT USAGE,CREATE ON SCHEMA public TO khedmah_migration_role;
      ALTER DEFAULT PRIVILEGES FOR ROLE khedmah_migration_role REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
      ALTER DEFAULT PRIVILEGES FOR ROLE khedmah_migrator REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
      SET SESSION AUTHORIZATION khedmah_migrator;
      SET search_path=public,pg_catalog;
    `);
    for(const migration of pack.migrations)await db.exec(migration.sql);
    // Retained contracts are owner-verified on PG16. Their version/deparser-
    // specific checks are excluded ONLY in this PG18 lab. All new grant,
    // baseline, exact-ACL, fingerprint and readback SQL is unmodified.
    const compat=s=>{
      assert.ok(s.includes(pack.retained_contract));
      return s.replace(pack.retained_contract,'');
    };
    const checkBaseline=async()=>{
      const rows=await db.exec(compat(pack.readonly));
      assert.deepEqual(rows.find(x=>x.rows?.[0]?.json_build_object).rows[0].json_build_object,pack.baseline);
    };
    await checkBaseline();
    // A grant outside the allowlist must abort and roll back all earlier grants.
    const badAcl=compat(pack.apply).replace(pack.grants,pack.grants+
      'GRANT SELECT ON public.category_taxonomy_022_before_image TO khedmah_runtime_role;\n');
    await assert.rejects(()=>db.exec(badAcl),/RUNTIME_GRANTS_EXACT_ACL_MISMATCH/);
    await db.exec('ROLLBACK;');await checkBaseline();
    // Schema changes must be caught even when expected column grants expand.
    const badSchema=compat(pack.apply).replace(pack.grants,pack.grants+
      'ALTER TABLE public.food_promo_codes ADD COLUMN lab_unexpected text;\n');
    await assert.rejects(()=>db.exec(badSchema),/RUNTIME_GRANTS_SCHEMA_CHANGED/);
    await db.exec('ROLLBACK;');await checkBaseline();
    const applied=await db.exec(compat(pack.apply));
    const receipt=applied.find(x=>x.rows?.[0]?.json_build_object).rows[0].json_build_object;
    assert.equal(applied.at(-1).rows[0]['?column?'],'PREVIEW_V2_RUNTIME_GRANTS_COMMIT_ACK');
    assert.equal(receipt.acl_exact,true);
    const readback=pack.readback.replaceAll('12'.repeat(32),receipt.schema_digest);
    await db.exec(readback);
    await assert.rejects(()=>db.exec(compat(pack.apply)),/RUNTIME_GRANTS_BASELINE_DRIFT_NO_APPLY/);
    await db.exec('ROLLBACK;');await db.exec(readback);
    await db.exec('GRANT UPDATE(user_id) ON khedmah_taxi.driver_approvals TO khedmah_runtime_role;');
    await assert.rejects(()=>db.exec(readback),/RUNTIME_GRANTS_EXACT_ACL_MISMATCH/);
    await db.exec('ROLLBACK; REVOKE UPDATE(user_id) ON khedmah_taxi.driver_approvals FROM khedmah_runtime_role;');
    await db.exec(readback);
    await db.exec('GRANT SELECT ON public.category_taxonomy_022_before_image TO PUBLIC;');
    await assert.rejects(()=>db.exec(readback),/RUNTIME_GRANTS_EXACT_ACL_MISMATCH/);
    await db.exec('ROLLBACK; REVOKE SELECT ON public.category_taxonomy_022_before_image FROM PUBLIC;');
    await db.exec(readback);
  } finally {
    await db?.close();await rm(dir,{recursive:true,force:true});
  }
});
