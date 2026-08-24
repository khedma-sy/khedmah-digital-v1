import { readFile } from 'node:fs/promises';

const requiredEnvironment = [
  'GOOGLE_CLOUD_PROJECT',
  'GOOGLE_CLOUD_REGION',
  'CLOUD_SQL_INSTANCE_CONNECTION_NAME',
  'OPERATIONS_PRODUCT_ROLE_BINDINGS',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'FIREBASE_API_KEY',
  'FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
];

const requiredFiles = [
  'apps/backend/src/identity/google-auth.service.ts',
  'apps/backend/src/identity/email/email-verification.service.ts',
  'apps/backend/src/identity/password-recovery.service.ts',
  'apps/frontend/lib/firebase/client.ts',
  'apps/frontend/app/auth/login/page.tsx',
  'cloudbuild.production.yaml',
];

await Promise.all(requiredFiles.map((file) => readFile(file, 'utf8')));

const missing = requiredEnvironment.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  throw new Error(`Missing Web identity production configuration: ${missing.join(', ')}`);
}

if (process.env.FIREBASE_PROJECT_ID !== process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
  throw new Error('Web and backend Firebase project IDs must match');
}

if (process.env.FIREBASE_API_KEY !== process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
  throw new Error('Web and backend Firebase API keys must come from the same protected production configuration');
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.EMAIL_FROM)) {
  throw new Error('EMAIL_FROM must be a valid production sender address');
}

for (const name of ['GOOGLE_LOGGING_ENABLED', 'GOOGLE_MONITORING_ENABLED', 'GOOGLE_ERROR_REPORTING_ENABLED']) {
  if (process.env[name] !== 'true') throw new Error(`${name} must be true in production`);
}

console.log(`Web identity production configuration valid (${requiredEnvironment.length} protected values checked).`);
