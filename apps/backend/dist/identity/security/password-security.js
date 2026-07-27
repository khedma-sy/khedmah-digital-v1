"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
const node_crypto_1 = require("node:crypto");
const ITERATIONS = 120_000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';
function hashPassword(password) {
    const salt = (0, node_crypto_1.randomBytes)(16).toString('base64url');
    const hash = (0, node_crypto_1.pbkdf2Sync)(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('base64url');
    return `pbkdf2_${DIGEST}$${ITERATIONS}$${salt}$${hash}`;
}
function verifyPassword(password, storedHash) {
    const [algorithm, iterationsText, salt, hash] = storedHash.split('$');
    const iterations = Number.parseInt(iterationsText, 10);
    if (algorithm !== `pbkdf2_${DIGEST}` || !Number.isInteger(iterations) || !salt || !hash) {
        return false;
    }
    const candidate = (0, node_crypto_1.pbkdf2Sync)(password, salt, iterations, KEY_LENGTH, DIGEST).toString('base64url');
    const candidateBuffer = Buffer.from(candidate);
    const hashBuffer = Buffer.from(hash);
    return candidateBuffer.length === hashBuffer.length && (0, node_crypto_1.timingSafeEqual)(candidateBuffer, hashBuffer);
}
//# sourceMappingURL=password-security.js.map