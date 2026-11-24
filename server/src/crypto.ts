import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { config } from "./config.js";

/**
 * Encryption of Telegram bot tokens that live in the database.
 *
 * A token is never stored in plain text. It is encrypted with AES-256-GCM
 * using a key derived from TOKEN_ENCRYPTION_KEY, so the database alone cannot
 * be used to impersonate a bot.
 *
 * The format is `v1.<salt>.<iv>.<tag>.<ciphertext>`, all parts base64url.
 */

const ALGO = "aes-256-gcm";
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/** Whether the web app may store bot tokens at all. */
export function tokenStorageEnabled(): boolean {
  return config.tokenEncryptionKey.length > 0;
}

/** Derive the encryption key from the configured secret. */
function deriveKey(salt: Buffer): Buffer {
  return scryptSync(config.tokenEncryptionKey, salt, KEY_LENGTH);
}

/** Encrypt a token. Throws when no encryption key is configured. */
export function encryptToken(token: string): string {
  if (!tokenStorageEnabled()) throw new Error("Chưa cấu hình TOKEN_ENCRYPTION_KEY.");
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, deriveKey(salt), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", salt.toString("base64url"), iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

/** Decrypt a token. Returns null when the value is unreadable. */
export function decryptToken(value: string | null | undefined): string | null {
  if (!value || !tokenStorageEnabled()) return null;
  const parts = value.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return null;
  try {
    const salt = Buffer.from(parts[1], "base64url");
    const iv = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    const encrypted = Buffer.from(parts[4], "base64url");
    const decipher = createDecipheriv(ALGO, deriveKey(salt), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    // A wrong key or a damaged value must never crash the request.
    return null;
  }
}

/** Hide the middle of a token so it can be shown in the admin list. */
export function maskToken(token: string): string {
  if (token.length <= 12) return "••••";
  return `${token.slice(0, 6)}••••${token.slice(-4)}`;
}
