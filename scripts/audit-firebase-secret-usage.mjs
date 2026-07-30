import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const names = [
  'FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_B64', 'NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID', 'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'
];
const workflow = await readFile('.github/workflows/google-production-readiness.yml', 'utf8');
const missingReferences = names.filter(name => !workflow.includes(`secrets.${name}`));
if (missingReferences.length) throw new Error(`Workflow does not consume Firebase secrets: ${missingReferences.join(', ')}`);
const webBuildStep = workflow.split('- name: Build Web with protected Firebase configuration')[1]?.split('- name: Build Android')[0] || '';
const missingWebBuildSecrets = names.slice(1).filter(name => !webBuildStep.includes(`secrets.${name}`));
if (missingWebBuildSecrets.length) throw new Error(`Protected Web build does not consume Firebase secrets: ${missingWebBuildSecrets.join(', ')}`);
for (const required of ['base64 --decode > apps/android/app/google-services.json', 'npm --workspace apps/frontend run build', 'rm -f apps/android/app/google-services.json']) {
  if (!workflow.includes(required)) throw new Error(`Workflow is missing required protected operation: ${required}`);
}
const webConfig = await readFile('apps/frontend/lib/firebase/config.ts', 'utf8');
const missingWebEnvironmentReads = names.slice(1).filter(name => !webConfig.includes(`process.env.${name}`));
if (missingWebEnvironmentReads.length) throw new Error(`Web Firebase config does not read environment variables: ${missingWebEnvironmentReads.join(', ')}`);
const initializers = execFileSync('git', ['grep', '-l', 'initializeApp(', '--', 'apps/frontend'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
if (initializers.length !== 1 || initializers[0] !== 'apps/frontend/lib/firebase/client.ts') throw new Error(`Firebase Web initialization must remain centralized: ${initializers.join(', ')}`);
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n');
const forbidden = tracked.filter(file => /(^|\/)(google-services\.json|GoogleService-Info\.plist|service-account.*\.json)$/.test(file));
if (forbidden.length) throw new Error(`Tracked Firebase credential/configuration files: ${forbidden.join(', ')}`);
console.log(`Firebase secret usage verified (${names.length} GitHub secret references; no protected native file tracked).`);
