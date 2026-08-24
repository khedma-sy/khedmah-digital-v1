'use client';

import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirebaseClientServices } from './client';

export async function getGoogleIdToken(): Promise<string> {
  const { auth } = getFirebaseClientServices();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(auth, provider);
  return credential.user.getIdToken(true);
}
