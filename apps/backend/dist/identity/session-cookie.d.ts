import type { Response } from 'express';
export declare function readSessionToken(cookieHeader: string | undefined): string | undefined;
export declare function attachSessionCookie(response: Response, token: string): void;
export declare function clearSessionCookie(response: Response): void;
