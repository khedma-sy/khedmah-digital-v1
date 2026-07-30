export interface VerifiedGoogleIdentity { readonly subject: string; readonly audience: string; }
export interface GoogleTokenVerifier { verifyIdToken(token: string, audiences: readonly string[]): Promise<VerifiedGoogleIdentity>; }
/** Backend verification boundary; deliberately does not activate OAuth/login. */
export async function verifyGoogleIdentity(verifier: GoogleTokenVerifier, token: string, audiences: readonly string[]) {
  if (!token.trim() || audiences.length === 0) throw new Error("Google token and audience are required");
  return verifier.verifyIdToken(token, audiences);
}
