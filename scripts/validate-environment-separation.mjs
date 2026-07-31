const environments = ['DEVELOPMENT', 'PREVIEW', 'STAGING', 'PRODUCTION'];
const required = environments.flatMap(environment => [
  `${environment}_GOOGLE_CLOUD_PROJECT`,
  `${environment}_FIREBASE_PROJECT_ID`
]);
const missing = required.filter(name => !process.env[name]?.trim());
if (missing.length) throw new Error(`Missing environment identity variables: ${missing.join(', ')}`);
for (const suffix of ['GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT_ID']) {
  const values = environments.map(environment => process.env[`${environment}_${suffix}`].trim());
  if (new Set(values).size !== values.length) throw new Error(`${suffix} must be unique across development, preview, staging, and production`);
}
const selected = process.env.DEPLOYMENT_ENVIRONMENT?.toUpperCase();
if (selected && !environments.includes(selected)) throw new Error('DEPLOYMENT_ENVIRONMENT must be development, preview, staging, or production');
console.log('Environment separation valid (development, preview, staging, production identities are unique).');
