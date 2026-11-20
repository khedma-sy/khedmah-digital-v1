import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

const ITERATIONS = 220_000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('base64url');

  return `pbkdf2_${DIGEST}$${ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  const [algorithm, iterationsText, salt, hash] = parts;
  const iterations = Number(iterationsText);

  if (parts.length !== 4 || algorithm !== `pbkdf2_${DIGEST}` || !/^[1-9][0-9]*$/.test(iterationsText ?? '') ||
      !Number.isSafeInteger(iterations) || iterations > 2_147_483_647 || !salt || !hash) {
    return false;
  }

  const candidate = pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString('base64url');
  const candidateBuffer = Buffer.from(candidate);
  const hashBuffer = Buffer.from(hash);

  return candidateBuffer.length === hashBuffer.length && timingSafeEqual(candidateBuffer, hashBuffer);
}

export function passwordNeedsRehash(storedHash: string): boolean {
  const [algorithm, iterationsText] = storedHash.split('$');
  return algorithm === `pbkdf2_${DIGEST}` && /^[1-9][0-9]*$/.test(iterationsText ?? '') &&
    Number(iterationsText) < ITERATIONS;
}
