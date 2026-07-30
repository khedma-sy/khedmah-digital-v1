import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const requireProduction = process.argv.includes('--production');
const results = [];
const check = (area, name, passed, detail) => results.push({ area, name, status: passed ? 'pass' : 'fail', detail });
const pending = (area, name, detail) => results.push({ area, name, status: 'pending_external', detail });
const read = (file) => readFile(file, 'utf8');

const requiredFiles = [
  'cloudbuild.production.yaml', 'infra/iac/main.tf', 'infra/firebase/firebase.json', 'infra/firebase/storage.rules',
  'config/google/google.ts', 'config/google/firebase.ts', 'config/google/maps.ts', 'scripts/google-production-deploy.sh',
  'scripts/google-production-rollback.sh', 'scripts/collect-live-production-evidence.sh', 'scripts/run-live-production-certification.sh',
  'docs/reports/operations-product-live-certification/production-certification-report.md', 'docs/google/disaster-recovery.md', 'docs/operations-product/README.md'
];
for (const file of requiredFiles) check('repository', file, existsSync(file), existsSync(file) ? 'present' : 'missing');

const terraform = await read('infra/iac/main.tf');
const requiredServices = ['run.googleapis.com', 'cloudbuild.googleapis.com', 'artifactregistry.googleapis.com', 'secretmanager.googleapis.com', 'storage.googleapis.com', 'logging.googleapis.com', 'monitoring.googleapis.com', 'compute.googleapis.com', 'dns.googleapis.com', 'certificatemanager.googleapis.com'];
for (const service of requiredServices) check('google-cloud', service, terraform.includes(service), 'required API declared in IaC');
for (const restriction of ['browser_key_restrictions', 'android_key_restrictions', 'server_key_restrictions']) check('maps-security', restriction, terraform.includes(restriction), 'separate key restriction declared');
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

const roleSource = await read('apps/backend/src/operations-product/operations-product.types.ts');
const roles = ['operations_product_director', 'infrastructure_manager', 'cloud_administrator', 'devops_engineer', 'production_engineer', 'release_manager', 'security_operations_engineer', 'site_reliability_engineer'];
for (const role of roles) check('rbac', role, roleSource.includes(`${role}:`), 'role has an explicit permission mapping');
const rbacSource = await read('apps/backend/src/operations-product/operations-rbac.service.ts');
check('rbac', 'deny by default', rbacSource.includes('if (!raw) return []') && rbacSource.includes('ForbiddenException'), 'unbound users receive no operations role');
check('governance', 'authority isolation', !roleSource.match(/board|executive|codex/i), 'operations role catalog contains no governance authority role');

const firebasePorts = await read('infra/firebase/firebase-services.ts');
for (const capability of ['Authentication', 'Messaging', 'Analytics', 'CrashReporting', 'Storage']) check('firebase', capability, firebasePorts.includes(`Firebase${capability}`), 'SDK-neutral boundary exists');
for (const capability of ['Remote Config', 'App Check', 'Hosting']) check('firebase', capability, terraform.toLowerCase().includes(capability.toLowerCase().replace(' ', '')), 'API declared in production IaC');

try {
  execFileSync('terraform', ['-chdir=infra/iac', 'validate'], { stdio: 'pipe' });
  check('google-cloud', 'terraform validate', true, 'Terraform configuration valid');
} catch (error) {
  const message = String(error.stderr || error.message || '');
  if (error.code === 'ENOENT') pending('google-cloud', 'terraform validate', 'Terraform CLI unavailable');
  else if (/Required plugins are not installed|Failed to query available provider packages|Missing required provider/.test(message)) pending('google-cloud', 'terraform validate', 'Provider installation unavailable in this environment');
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
if (requireProduction && /(?:dev|development|staging|test|local)/i.test(prod.FIREBASE_PROJECT_ID || '')) check('firebase', 'production isolation', false, 'FIREBASE_PROJECT_ID resembles a non-production project');
else if (requireProduction) check('firebase', 'production isolation', true, 'production project identifier does not match forbidden environment labels');
else pending('firebase', 'production isolation', 'requires injected production project identifier and Google/Firebase console evidence');

const summary = results.reduce((value, result) => ({ ...value, [result.status]: (value[result.status] || 0) + 1 }), {});
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), mode: requireProduction ? 'production' : 'repository', summary, results }, null, 2));
if (results.some(result => result.status === 'fail')) process.exitCode = 1;
