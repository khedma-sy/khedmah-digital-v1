import { Injectable, UnauthorizedException } from '@nestjs/common';

interface FirebaseLookupUser {
  readonly localId?: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly displayName?: string;
  readonly providerUserInfo?: ReadonlyArray<{ providerId?: string; rawId?: string; displayName?: string; email?: string }>;
}

@Injectable()
export class FirebaseAuthService {
  async verifyGoogleIdToken(idToken: unknown): Promise<{ subject: string; email: string; displayName: string }> {
    if (typeof idToken !== 'string' || idToken.length < 100) throw new UnauthorizedException('Invalid Google identity token.');
    const apiKey = (process.env.FIREBASE_WEB_API_KEY ?? process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '').trim();
    if (!apiKey) throw new Error('FIREBASE_WEB_API_KEY is required for Google authentication.');

    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    if (!response.ok) throw new UnauthorizedException('Invalid Google identity token.');

    const payload = await response.json() as { users?: FirebaseLookupUser[] };
    const user = payload.users?.[0];
    const google = user?.providerUserInfo?.find((provider) => provider.providerId === 'google.com');
    const email = (user?.email ?? google?.email ?? '').trim().toLowerCase();
    const subject = (google?.rawId ?? user?.localId ?? '').trim();
    if (!user || !user.emailVerified || !email || !subject || !google) {
      throw new UnauthorizedException('Google account is not eligible for sign in.');
    }

    return {
      subject,
      email,
      displayName: (user.displayName ?? google.displayName ?? email.split('@')[0] ?? 'مستخدم خدمة').trim().slice(0, 80)
    };
  }
}
