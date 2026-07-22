import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

const ITERATIONS = 120_000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('base64url');

  return `pbkdf2_${DIGEST}$${ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, iterationsText, salt, hash] = storedHash.split('$');
  const iterations = Number.parseInt(iterationsText, 10);

  if (algorithm !== `pbkdf2_${DIGEST}` || !Number.isInteger(iterations) || !salt || !hash) {
    return false;
  }

  const candidate = pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString('base64url');
  const candidateBuffer = Buffer.from(candidate);
  const hashBuffer = Buffer.from(hash);

  return candidateBuffer.length === hashBuffer.length && timingSafeEqual(candidateBuffer, hashBuffer);
}
