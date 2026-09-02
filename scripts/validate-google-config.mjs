import { readFile } from "node:fs/promises";
const production = process.argv.includes("--production");
const files = [".env.production", "config/google/google.ts", "config/google/firebase.ts", "config/google/maps.ts", "infra/firebase/firebase.json", "infra/secrets/required-secrets.yaml", "infra/iac/main.tf"];
await Promise.all(files.map(file => readFile(file, "utf8")));
const contract = await readFile(".env.production", "utf8");
const names = [...contract.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map(match => match[1]);
const required = names.filter(name => !name.endsWith("_ENABLED") && name !== "GOOGLE_APPLICATION_CREDENTIALS");
const leaked = contract.split("\n").filter(line => /^[A-Z][A-Z0-9_]+=.+/.test(line) && !/=(?:false|europe-west1)$/.test(line));
if (leaked.length) throw new Error(".env.production must not contain populated credentials");
if (production) {
  const missing = required.filter(name => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing production environment variables: ${missing.join(", ")}`);
  if (process.env.GCS_MEDIA_LOCATION !== 'europe-west1') {
    throw new Error('GCS_MEDIA_LOCATION must be europe-west1 for the approved production media stack');
  }
  if (process.env.GOOGLE_CLOUD_REGION !== 'europe-west1') {
    throw new Error('GOOGLE_CLOUD_REGION must be europe-west1 for the approved production runtime');
  }
}
console.log(`Google configuration valid (${files.length} files, ${required.length} required variables checked).`);
