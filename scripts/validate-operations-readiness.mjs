import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const requireProduction = process.argv.includes('--production');
const results = [];
const check = (area, name, passed, detail) => results.push({ area, name, status: passed ? 'pass' : 'fail', detail });
const pending = (area, name, detail) => results.push({ area, name, status: 'pending_external', detail });
const read = (file) => readFile(file, 'utf8');

const requiredFiles = [
  'cloudbuild.production-new-account.yaml', 'infra/iac/main.tf', 'infra/iac/bootstrap/main.tf', 'infra/iac/client-maps/main.tf', 'infra/firebase/firebase.json', 'infra/firebase/storage.rules',
  'config/google/google.ts', 'config/google/firebase.ts', 'config/google/maps.ts', 'scripts/google-production-deploy.sh',
  'scripts/google-production-rollback.sh', 'scripts/collect-live-production-evidence.sh', 'scripts/validate-production-domain-readiness.sh', 'scripts/run-live-production-certification.sh',
  '.github/workflows/production-operator-new-account.yml', '.github/workflows/production-baseline-001-020.yml',
  '.github/workflows/production-database-role-bootstrap.yml', '.github/workflows/production-operator.yml',
  '.github/workflows/production-migrations-025-034.yml', '.github/workflows/android-release-certification.yml',
  '.github/workflows/terraform-client-maps-plan.yml', '.github/workflows/terraform-client-maps-apply.yml',
  'docs/reports/operations-product-live-certification/production-certification-report.md', 'docs/google/disaster-recovery.md', 'docs/operations-product/README.md'
];
for (const file of requiredFiles) check('repository', file, existsSync(file), existsSync(file) ? 'present' : 'missing');

const terraform = await read('infra/iac/main.tf');
const bootstrapTerraform = await read('infra/iac/bootstrap/main.tf');
const clientMapsTerraform = await read('infra/iac/client-maps/main.tf');
const requiredServices = ['run.googleapis.com', 'cloudbuild.googleapis.com', 'artifactregistry.googleapis.com', 'secretmanager.googleapis.com', 'storage.googleapis.com', 'logging.googleapis.com', 'monitoring.googleapis.com', 'compute.googleapis.com', 'dns.googleapis.com', 'certificatemanager.googleapis.com'];
for (const service of requiredServices) check('google-cloud', service, bootstrapTerraform.includes(service), 'required API declared in new-account bootstrap IaC');
for (const restriction of ['browser_key_restrictions', 'android_key_restrictions']) check('maps-security', restriction, clientMapsTerraform.includes(restriction), 'restricted client key declared in isolated client-maps stack');
check('maps-security', 'no client-maps server key', !clientMapsTerraform.includes('server_key_restrictions') && !clientMapsTerraform.includes('maps_server'), 'unused server key is not created by the new-account client stack');
check('iam', 'no project-wide secret accessor', !terraform.includes('google_project_iam_member" "runtime_secret_accessor'), 'Secret access must be granted per secret');

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const forbiddenNames = tracked.filter(file => /(^|\/)(google-services\.json|GoogleService-Info\.plist|service-account.*\.json|\.env\.(local|development|staging))$/.test(file));
check('security', 'forbidden credential files', forbiddenNames.length === 0, forbiddenNames.join(', ') || 'none tracked');
const secretPattern = /(AIza[0-9A-Za-z_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|["']client_secret["']\s*:\s*["'][^"']{8})/;
const leaked = [];
for (const file of tracked) {
  if (/\.(png|jpg|jpeg|gif|ico|woff2?|pdf)$/.test(file)) continue;
  const value = await read(file).catch(() => '');
  if (secretPattern.test(value)) leaked.push(file);
}
check('security', 'credential signature scan', leaked.length === 0, leaked.join(', ') || 'no signatures found');

const legacyProject = ['project', '94512a0e', '1a5e', '4bdb', '87f'].join('-');
const legacyNumber = ['774201', '339973'].join('');
const legacyPattern = new RegExp(`${legacyProject}|${legacyNumber}`);
const runtimeCritical = tracked.filter(file =>
  file === 'cloudbuild.production-new-account.yaml' ||
  file === 'scripts/google-production-deploy.sh' ||
  file === '.github/workflows/production-operator-new-account.yml' ||
  file === '.github/workflows/production-baseline-001-020.yml' ||
  file === '.github/workflows/production-database-role-bootstrap.yml' ||
  file === '.github/workflows/production-operator.yml' ||
  file === '.github/workflows/production-migrations-025-034.yml' ||
  file === '.github/workflows/android-release-certification.yml' ||
  file === '.github/workflows/terraform-client-maps-plan.yml' ||
  file === '.github/workflows/terraform-client-maps-apply.yml' ||
  file.startsWith('infra/iac/') || file.startsWith('config/google/')
);
const legacyRuntimeBindings = [];
const assignmentLike = /(?:GOOGLE_CLOUD_PROJECT|_RUNTIME_SERVICE_ACCOUNT|_CLOUD_SQL_INSTANCE|_NEXT_PUBLIC_API_URL|_CORS_ORIGIN|_GCS_MEDIA_BUCKET)\s*[:=][^\n]*/g;
for (const file of runtimeCritical) {
  const value = await read(file).catch(() => '');
  const assignments = value.match(assignmentLike) || [];
  if (assignments.some(line => legacyPattern.test(line))) legacyRuntimeBindings.push(file);
}
check('google-cloud', 'no legacy production binding', legacyRuntimeBindings.length === 0, legacyRuntimeBindings.join(', ') || 'runtime-critical production assignments are account-neutral');

const roleSource = await read('apps/backend/src/operations-product/operations-product.types.ts');
const roles = ['operations_product_director', 'infrastructure_manager', 'cloud_administrator', 'devops_engineer', 'production_engineer', 'release_manager', 'security_operations_engineer', 'site_reliability_engineer'];
for (const role of roles) check('rbac', role, roleSource.includes(`${role}:`), 'role has an explicit permission mapping');
const rbacSource = await read('apps/backend/src/operations-product/operations-rbac.service.ts');
check('rbac', 'deny by default', rbacSource.includes('if (!raw) return []') && rbacSource.includes('ForbiddenException'), 'unbound users receive no operations role');
check('governance', 'authority isolation', !roleSource.match(/board|executive|codex/i), 'operations role catalog contains no governance authority role');

const firebasePorts = await read('infra/firebase/firebase-services.ts');
for (const capability of ['Authentication', 'Messaging', 'Analytics', 'CrashReporting', 'Storage']) check('firebase', capability, firebasePorts.includes(`Firebase${capability}`), 'SDK-neutral boundary exists');
for (const capability of ['Remote Config', 'App Check', 'Hosting']) check('firebase', capability, bootstrapTerraform.toLowerCase().includes(capability.toLowerCase().replace(' ', '')), 'API declared in new-account bootstrap IaC');

try {
  execFileSync('terraform', ['-chdir=infra/iac', 'init', '-backend=false', '-input=false'], { stdio: 'pipe' });
  execFileSync('terraform', ['-chdir=infra/iac', 'validate'], { stdio: 'pipe' });
  check('google-cloud', 'terraform validate', true, 'Terraform configuration initialized without its production backend and valid');
} catch (error) {
  const message = String(error.stderr || error.message || '');
  if (error.code === 'ENOENT') pending('google-cloud', 'terraform validate', 'Terraform CLI unavailable');
  else if (/Required plugins are not installed|Failed to query available provider packages|Missing required provider|there is no package for .* cached in \.terraform\/providers/i.test(message)) pending('google-cloud', 'terraform validate', 'Provider initialization unavailable in this environment');
  else check('google-cloud', 'terraform validate', false, 'terraform validate failed');
}

const prod = process.env;
const externalRequirements = [
  ['google-cloud', 'project identity', 'GOOGLE_CLOUD_PROJECT'], ['firebase', 'isolated production project', 'FIREBASE_PROJECT_ID'],
  ['monitoring', 'Cloud Logging enabled', 'GOOGLE_LOGGING_ENABLED'], ['monitoring', 'Cloud Monitoring enabled', 'GOOGLE_MONITORING_ENABLED'],
  ['monitoring', 'Error Reporting enabled', 'GOOGLE_ERROR_REPORTING_ENABLED'], ['rbac', 'production role bindings', 'OPERATIONS_PRODUCT_ROLE_BINDINGS']
];
for (const [area, name, variable] of externalRequirements) {
  const value = prod[variable]?.trim();
  const valid = variable.endsWith('_ENABLED') ? value === 'true' : Boolean(value);
  if (requireProduction) check(area, name, valid, valid ? `${variable} injected` : `${variable} missing or not enabled`);
  else pending(area, name, `${variable} requires production environment evidence`);
}
if (requireProduction && legacyPattern.test(prod.GOOGLE_CLOUD_PROJECT || '')) check('google-cloud', 'project isolation', false, 'GOOGLE_CLOUD_PROJECT references the legacy project');
else if (requireProduction) check('google-cloud', 'project isolation', true, 'production Google project is not the legacy project');
if (requireProduction && /(?:dev|development|staging|test|local)/i.test(prod.FIREBASE_PROJECT_ID || '')) check('firebase', 'production isolation', false, 'FIREBASE_PROJECT_ID resembles a non-production project');
else if (requireProduction && legacyPattern.test(prod.FIREBASE_PROJECT_ID || '')) check('firebase', 'production isolation', false, 'FIREBASE_PROJECT_ID references the legacy project');
else if (requireProduction) check('firebase', 'production isolation', true, 'production project identifier does not match forbidden environment labels or legacy project');
else pending('firebase', 'production isolation', 'requires injected production project identifier and Google/Firebase console evidence');

const summary = results.reduce((value, result) => ({ ...value, [result.status]: (value[result.status] || 0) + 1 }), {});
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), mode: requireProduction ? 'production' : 'repository', summary, results }, null, 2));
if (results.some(result => result.status === 'fail')) process.exitCode = 1;
