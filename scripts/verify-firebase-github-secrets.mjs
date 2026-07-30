const requiredNames = [
  'FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_B64',
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'
];

const missing = requiredNames.filter(name => !process.env[name]?.trim());
if (missing.length) throw new Error(`Missing required Firebase GitHub Actions secrets: ${missing.join(', ')}`);

let androidConfig;
try {
  androidConfig = JSON.parse(Buffer.from(process.env.FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_B64, 'base64').toString('utf8'));
} catch {
  throw new Error('FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_B64 is not valid base64-encoded JSON');
}
const webProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if (androidConfig.project_info?.project_id !== webProjectId) {
  throw new Error('Android and Web Firebase secrets identify different projects');
}
const clients = Array.isArray(androidConfig.client) ? androidConfig.client : [];
if (!clients.some(client => client.client_info?.android_client_info?.package_name === 'com.khedmah.digital')) {
  throw new Error('Android Firebase secret does not contain com.khedmah.digital');
}
if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PROJECT_ID !== webProjectId) {
  throw new Error('Firebase server variable does not match the Firebase Web secret');
}
console.log(`Firebase GitHub Actions secret contract verified (${requiredNames.length} secret names; values redacted).`);
