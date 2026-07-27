"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readSessionToken = readSessionToken;
exports.attachSessionCookie = attachSessionCookie;
exports.clearSessionCookie = clearSessionCookie;
const COOKIE_NAME = 'khedmah_session';
const MAX_AGE_SECONDS = 60 * 60;
function readSessionToken(cookieHeader) {
    if (!cookieHeader) {
        return undefined;
    }
    const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
    const sessionCookie = cookies.find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
    if (!sessionCookie) {
        return undefined;
    }
    return decodeURIComponent(sessionCookie.slice(COOKIE_NAME.length + 1));
}
function attachSessionCookie(response, token) {
    response.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: MAX_AGE_SECONDS * 1000,
        path: '/api/v1'
    });
}
function clearSessionCookie(response) {
    response.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        path: '/api/v1'
    });
}
//# sourceMappingURL=session-cookie.js.map