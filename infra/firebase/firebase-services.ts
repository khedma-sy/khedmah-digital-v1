/** SDK-neutral, injectable ports. Importing this file never initializes Firebase. */
export interface FirebaseAuthentication { verifyIdToken(token: string): Promise<{ uid: string }>; }
export interface FirebaseMessaging { send(message: unknown): Promise<string>; }
export interface FirebaseAnalytics { record(name: string, safeParameters?: Readonly<Record<string, string>>): void; }
export interface FirebaseCrashReporting { record(error: Error): void; }
export interface FirebaseStorage { signedUploadPath(objectPath: string): Promise<string>; }
export interface FirebaseServices {
  readonly authentication: FirebaseAuthentication;
  readonly messaging: FirebaseMessaging;
  readonly analytics: FirebaseAnalytics;
  readonly crashReporting: FirebaseCrashReporting;
  readonly storage: FirebaseStorage;
}
