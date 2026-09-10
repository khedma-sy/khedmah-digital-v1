import { DatabasePool } from './database.pool';
import { auditReleaseDataIntegrity } from './release-data-integrity-audit';

async function main(): Promise<void> {
  const db = new DatabasePool();
  db.onModuleInit();
  try {
    const report = await auditReleaseDataIntegrity(db);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) process.exitCode = 2;
  } finally {
    await db.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown release data integrity audit failure.';
  process.stderr.write(`RELEASE_DATA_INTEGRITY_AUDIT_FAILED: ${message}\n`);
  process.exitCode = 1;
});
