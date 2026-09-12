import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'node:crypto';

/** argon2id — current OWASP-recommended default (see IMPLEMENTATION_DECISIONS.md D-006). */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

/** Opaque bearer token (refresh / password-reset) — only its SHA-256 hash is persisted. */
export function generateOpaqueToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
