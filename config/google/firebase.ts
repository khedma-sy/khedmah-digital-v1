import { requireEnvironment, type Environment } from "./env";
export function firebaseConfig(env: Environment = process.env) {
  return Object.freeze({
    projectId: requireEnvironment("FIREBASE_PROJECT_ID", env), apiKey: requireEnvironment("FIREBASE_API_KEY", env),
    appId: requireEnvironment("FIREBASE_APP_ID", env), authDomain: requireEnvironment("FIREBASE_AUTH_DOMAIN", env),
    storageBucket: requireEnvironment("FIREBASE_STORAGE_BUCKET", env), messagingSenderId: requireEnvironment("FIREBASE_MESSAGING_SENDER_ID", env),
    measurementId: requireEnvironment("FIREBASE_MEASUREMENT_ID", env),
  });
}
