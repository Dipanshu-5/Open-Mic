import 'server-only';
import {
  createHash,
  randomBytes,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { readEnv } from './env.js';

/** @param {string} value */
export function hashToken(value) {
  return createHash('sha256').update(value).digest('hex');
}
export function createToken() {
  return randomBytes(32).toString('base64url');
}
/** @param {string} a @param {string} b */
export function equalSignature(a, b) {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
function key() {
  const env = readEnv();
  return Buffer.from(
    env.APP_MODE === 'demo'
      ? 'd'.repeat(64)
      : env.BOOKING_LINK_ENCRYPTION_KEY || '',
    'hex',
  );
}
/** @param {string} token */
export function encryptToken(token) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    'base64url',
  );
}
/** @param {string} value */
export function decryptToken(value) {
  const buffer = Buffer.from(value, 'base64url');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key(),
    buffer.subarray(0, 12),
  );
  decipher.setAuthTag(buffer.subarray(12, 28));
  return Buffer.concat([
    decipher.update(buffer.subarray(28)),
    decipher.final(),
  ]).toString('utf8');
}
