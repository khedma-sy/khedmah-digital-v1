export declare class SessionTokenService {
    createToken(): string;
    hashToken(token: string): string;
    expiresAt(now?: number): string;
}
