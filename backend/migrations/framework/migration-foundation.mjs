export const MIGRATION_VERSION_PATTERN = /^\d{3}$/;
export const MIGRATION_NAME_PATTERN = /^\d{3}_[a-z][a-z0-9_]*\.sql$/;

export const MigrationExecutionStep = Object.freeze({
  VALIDATE_NAME: 'validate_name',
  READ_PLAN: 'read_plan',
  APPLY_FORWARD: 'apply_forward',
  VERIFY_FORWARD: 'verify_forward',
  PREPARE_ROLLBACK: 'prepare_rollback',
  VERIFY_ROLLBACK: 'verify_rollback',
});

export const MigrationSafetyRule = Object.freeze({
  requiresRollbackPlan: true,
  requiresForwardVerification: true,
  requiresRollbackVerification: true,
  allowsBusinessTablesInPhaseOne: false,
  allowsSeedDataInPhaseOne: false,
  executesAutomaticallyInProduction: false,
});

export function validateMigrationName(value) {
  const valid = MIGRATION_NAME_PATTERN.test(String(value || ''));
  return Object.freeze({ valid, errors: Object.freeze(valid ? [] : [{ field: 'migrationName', code: 'DATABASE_MIGRATION_ERROR', message: 'Migration name must use NNN_lowercase_snake_case.sql format.' }]) });
}

export function createMigrationExecutionPlan({ migrationName, rollbackName } = {}) {
  const nameValidation = validateMigrationName(migrationName);
  const rollbackValidation = validateMigrationName(rollbackName);
  const valid = nameValidation.valid && rollbackValidation.valid;
  return Object.freeze({
    valid,
    migrationName,
    rollbackName,
    steps: Object.freeze(Object.values(MigrationExecutionStep)),
    executesSql: false,
    createsBusinessTables: false,
    errors: Object.freeze([...nameValidation.errors, ...rollbackValidation.errors]),
  });
}
