const environments = ['DEVELOPMENT', 'PREVIEW', 'STAGING', 'PRODUCTION'];
const selected = process.env.DEPLOYMENT_ENVIRONMENT?.toUpperCase();
if (selected && !environments.includes(selected)) throw new Error('DEPLOYMENT_ENVIRONMENT must be development, preview, staging, or production');
const requiredEnvironments = selected === 'PREVIEW'
  ? ['PREVIEW', 'STAGING', 'PRODUCTION']
  : environments;
const firebaseEnvironments = selected === 'PREVIEW'
  ? ['PREVIEW', 'PRODUCTION']
  : environments;
const required = [
  ...requiredEnvironments.map(environment => `${environment}_GOOGLE_CLOUD_PROJECT`),
  ...firebaseEnvironments.map(environment => `${environment}_FIREBASE_PROJECT_ID`)
];
const missing = required.filter(name => !process.env[name]?.trim());
if (missing.length) throw new Error(`Missing environment identity variables: ${missing.join(', ')}`);
for (const suffix of ['GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT_ID']) {
  const scopedEnvironments = suffix === 'FIREBASE_PROJECT_ID' ? firebaseEnvironments : requiredEnvironments;
  const values = scopedEnvironments.map(environment => process.env[`${environment}_${suffix}`].trim());
  if (new Set(values).size !== values.length) throw new Error(`${suffix} must be unique across development, preview, staging, and production`);
}
console.log(`Environment separation valid (${requiredEnvironments.map(value => value.toLowerCase()).join(', ')} identities are unique).`);
