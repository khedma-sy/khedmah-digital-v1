import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const production = process.argv.includes('--production');
const androidConfigPath = 'apps/android/app/google-services.json';
const requiredWebVariables = [
  'NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', 'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'
];
const requiredFiles = [
  'apps/frontend/lib/firebase/config.ts', 'apps/frontend/lib/firebase/client.ts',
  'apps/frontend/lib/firebase/analytics.ts', 'apps/frontend/lib/firebase/fcm.ts',
  'apps/android/app/build.gradle.kts', 'apps/android/app/src/main/java/com/khedmah/digital/KhedmahApplication.kt'
];
await Promise.all(requiredFiles.map(file => readFile(file, 'utf8')));

if (production) {
  const missing = requiredWebVariables.filter(name => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing production Firebase web variables: ${missing.join(', ')}`);
  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== process.env.FIREBASE_PROJECT_ID) {
    throw new Error('Web and server Firebase project IDs must identify the same approved production project');
  }
  if (!existsSync(androidConfigPath)) throw new Error(`Missing protected Android Firebase configuration: ${androidConfigPath}`);
  const androidConfig = JSON.parse(await readFile(androidConfigPath, 'utf8'));
  if (androidConfig.project_info?.project_id !== process.env.FIREBASE_PROJECT_ID) throw new Error('Android Firebase project does not match the approved production project');
  const clients = Array.isArray(androidConfig.client) ? androidConfig.client : [];
  const packageNames = clients.map(client => client.client_info?.android_client_info?.package_name);
  if (!packageNames.includes('com.khedmah.digital')) throw new Error('Android Firebase configuration does not contain com.khedmah.digital');
}
console.log(`Firebase SDK integration valid (${production ? 'production' : 'repository'} mode).`);
