'use client';

import { FacebookAuthProvider, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirebaseClientServices } from './client';

export async function getGoogleIdToken(): Promise<string> {
  const { auth } = getFirebaseClientServices();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(auth, provider);
  return credential.user.getIdToken(true);
}

export async function getFacebookIdToken(): Promise<string> {
  const { auth } = getFirebaseClientServices();
  const provider = new FacebookAuthProvider();
  provider.addScope('email');
  const credential = await signInWithPopup(auth, provider);
  return credential.user.getIdToken(true);
}
