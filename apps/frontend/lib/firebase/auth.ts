'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirebaseWebConfig } from './config';

export async function getGoogleIdToken(): Promise<string> {
  const app = getApps().length > 0 ? getApp() : initializeApp(getFirebaseWebConfig());
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(auth, provider);
  return credential.user.getIdToken(true);
}
