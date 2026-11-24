/**
 * Verification of Telegram WebApp `initData`.
 *
 * Telegram signs `initData` with a key derived from the bot token:
 *
 *   secret_key = HMAC_SHA256(key = "WebAppData", msg = bot_token)
 *   hash       = HMAC_SHA256(key = secret_key,  msg = data_check_string)
 *
 * Because the site may be opened through several bots, every token is tried.
 * The tokens never leave this process.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface ParsedInitData {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  authDate: number;
  /** The exact string that was hashed, kept for debugging only. */
  dataCheckString: string;
}

export interface VerifyResult {
  ok: boolean;
  telegramId?: number;
  username?: string | null;
  firstName?: string | null;
  authDate?: number;
  error?: string;
}

/** InitData older than this many seconds is refused (replay protection). */
export const MAX_AUTH_AGE_SECONDS = 24 * 3600;

/**
 * Split the query string of `initData` into its key/value pairs.
 * Telegram sends the pairs in any order, so they must not be sorted here.
 */
export function parseInitData(initData: string): URLSearchParams {
  return new URLSearchParams(initData);
}

/** Build the string that Telegram signed. */
export function buildDataCheckString(params: URLSearchParams): string {
  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key === "hash") return;
    pairs.push(`${key}=${value}`);
  });
  return pairs.join("\n");
}

/** Derive the signing key of one bot token. */
export function secretKeyOf(token: string): Buffer {
  return createHmac("sha256", "WebAppData").update(token).digest();
}

/** Compute the expected hash for one token. */
export function computeHash(token: string, dataCheckString: string): string {
  return createHmac("sha256", secretKeyOf(token)).update(dataCheckString).digest("hex");
}

/** Compare two hex hashes without leaking their content through timing. */
export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify `initData` against every known bot token.
 *
 * `now` and `maxAgeSeconds` are injectable so the logic can be tested without
 * waiting for the clock.
 */
export function verifyInitData(
  initData: string,
  tokens: string[],
  options: { now?: number; maxAgeSeconds?: number } = {},
): VerifyResult {
  if (!initData || !initData.trim()) return { ok: false, error: "Thiếu initData." };
  if (!tokens.length) return { ok: false, error: "Chưa cấu hình token bot." };

  const params = parseInitData(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, error: "initData không có chữ ký." };

  const dataCheckString = buildDataCheckString(params);
  const matched = tokens.some((token) => safeEqualHex(computeHash(token, dataCheckString), hash));
  if (!matched) return { ok: false, error: "Chữ ký initData không hợp lệ." };

  const telegramId = Number(params.get("user") ? parseUserId(params.get("user") ?? "") : NaN);
  if (!Number.isFinite(telegramId) || telegramId <= 0) {
    return { ok: false, error: "initData không có người dùng Telegram." };
  }

  const authDateRaw = Number(params.get("auth_date"));
  if (!Number.isFinite(authDateRaw) || authDateRaw <= 0) {
    return { ok: false, error: "initData không có auth_date hợp lệ." };
  }

  const now = Math.floor((options.now ?? Date.now()) / 1000);
  const maxAge = options.maxAgeSeconds ?? MAX_AUTH_AGE_SECONDS;
  if (now - authDateRaw > maxAge) {
    return { ok: false, error: "Phiên Telegram đã hết hạn, mở lại từ bot." };
  }

  const user = params.get("user");
  const parsedUser = user ? safeJsonParse(user) : null;
  const userRecord = (parsedUser ?? {}) as { first_name?: unknown; username?: unknown };
  const firstName = typeof userRecord.first_name === "string" ? userRecord.first_name : null;
  const username = typeof userRecord.username === "string" ? userRecord.username : null;

  return { ok: true, telegramId, username, firstName, authDate: authDateRaw };
}

/** Read the Telegram id out of the `user` field. */
function parseUserId(raw: string): number | null {
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const id = (parsed as { id?: unknown }).id;
  return typeof id === "number" ? id : null;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
