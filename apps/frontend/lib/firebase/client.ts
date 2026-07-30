import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFirebaseWebConfig } from './config';

export interface FirebaseClientServices {
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly firestore: Firestore;
  readonly storage: FirebaseStorage;
}

/** Idempotent SDK initialization; it does not sign in or perform a data operation. */
export function getFirebaseClientServices(): FirebaseClientServices {
  const app = getApps().length === 0 ? initializeApp(getFirebaseWebConfig()) : getApp();
  return Object.freeze({ app, auth: getAuth(app), firestore: getFirestore(app), storage: getStorage(app) });
}
