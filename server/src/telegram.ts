import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { config } from "./config.js";
import { db } from "./db/index.js";
import {
  deliveryLog,
  telegramBots,
  telegramLinkCodes,
  telegramLinks,
  telegramUsers,
  telegramUserLinks,
  users,
} from "./db/schema.js";

/** Telegram ids fit in a JS number safely (they are 52-bit). */
export type TelegramId = number;

/* ------------------------------------------------------------------ *
 * Shared secret between the web and the bot service
 * ------------------------------------------------------------------ */

/** Constant-time comparison of the X-Bot-Secret header. */
export function isValidBotSecret(header: string | undefined): boolean {
  const expected = config.botApiSecret;
  if (!expected) return false;
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ *
 * Telegram initData verification
 *
 * The signature can only be checked with a bot token, and tokens live in the
 * bot service — never in the web app. The web therefore asks the bot service
 * over the loopback interface to verify the payload.
 * ------------------------------------------------------------------ */

export interface InitDataUser {
  telegramId: TelegramId;
  username: string | null;
  firstName: string | null;
  authDate: number;
}

/**
 * Ask the bot service to verify initData. Returns null when the payload is
 * invalid, expired or the service is unreachable.
 */
export async function verifyInitData(initData: string): Promise<InitDataUser | null> {
  if (!initData || initData.length > 8000) return null;
  try {
    const res = await fetch(`${config.botInternalUrl}/internal/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bot-secret": config.botApiSecret },
      body: JSON.stringify({ initData }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      telegramId?: number | string;
      username?: string | null;
      firstName?: string | null;
      authDate?: number;
    };
    if (!data.ok || data.telegramId === undefined) return null;
    const telegramId = Number(data.telegramId);
    if (!Number.isFinite(telegramId) || telegramId <= 0) return null;
    return {
      telegramId,
      username: data.username ? data.username.slice(0, 64) : null,
      firstName: data.firstName ? data.firstName.slice(0, 80) : null,
      authDate: Number(data.authDate ?? 0),
    };
  } catch {
    return null;
  }
}

/** Telegram signs initData with a daily-ish validity; 24h is the documented limit. */
export const INIT_DATA_MAX_AGE_SEC = 24 * 3600;

export function isInitDataFresh(authDate: number): boolean {
  if (!authDate) return false;
  const age = Math.floor(Date.now() / 1000) - authDate;
  return age >= -60 && age <= INIT_DATA_MAX_AGE_SEC;
}

/* ------------------------------------------------------------------ *
 * Users in the Telegram tables
 * ------------------------------------------------------------------ */

/** Find or create the row describing a Telegram person. */
export async function ensureTelegramUser(
  telegramId: TelegramId,
  info?: { username?: string | null; firstName?: string | null },
) {
  const [existing] = await db.select().from(telegramUsers).where(eq(telegramUsers.telegramId, telegramId)).limit(1);
  if (existing) {
    // Refresh the profile fields but never clear an existing value with null.
    const patch: { username?: string | null; firstName?: string | null; updatedAt?: Date } = { updatedAt: new Date() };
    if (info?.username && info.username !== existing.username) patch.username = info.username;
    if (info?.firstName && info.firstName !== existing.firstName) patch.firstName = info.firstName;
    if (Object.keys(patch).length > 1) {
      await db.update(telegramUsers).set(patch).where(eq(telegramUsers.id, existing.id));
    }
    return existing;
  }
  const [created] = await db
    .insert(telegramUsers)
    .values({ telegramId, username: info?.username ?? null, firstName: info?.firstName ?? null })
    .onConflictDoNothing({ target: telegramUsers.telegramId })
    .returning();
  if (created) return created;
  const [again] = await db.select().from(telegramUsers).where(eq(telegramUsers.telegramId, telegramId)).limit(1);
  return again;
}

/** Remember that a Telegram person started a given bot. */
export async function recordBotStart(telegramId: TelegramId, botId: string) {
  const row = await ensureTelegramUser(telegramId);
  await db.insert(telegramUserLinks).values({ telegramId: row.id, botId }).onConflictDoNothing();
  await db.update(telegramUsers).set({ lastBotId: botId, updatedAt: new Date() }).where(eq(telegramUsers.id, row.id));
}

/** The web account linked to a Telegram person (if any). */
export async function linkedWebUser(telegramId: TelegramId) {
  const [link] = await db
    .select({ user: users, method: telegramLinks.method })
    .from(telegramLinks)
    .innerJoin(users, eq(users.id, telegramLinks.userId))
    .innerJoin(telegramUsers, eq(telegramUsers.id, telegramLinks.telegramId))
    .where(eq(telegramUsers.telegramId, telegramId))
    .limit(1);
  return link ?? null;
}

/* ------------------------------------------------------------------ *
 * Web accounts created from Telegram
 * ------------------------------------------------------------------ */

/** Strip control characters and clip to the column width. */
export function sanitizeDisplayName(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .split("")
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 80);
}

/** Build a unique web username from the Telegram profile. */
export async function generateTelegramUsername(telegramId: TelegramId, tgUsername: string | null): Promise<string> {
  const base = (tgUsername ? tgUsername.replace(/[^a-zA-Z0-9_.]/g, "") : "").slice(0, 12) || "tg";
  const prefix = base.slice(0, 10).toLowerCase();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const suffix = attempt === 0 ? String(telegramId).slice(-4) : String(randomInt(1000, 10000));
    const candidate = `tg_${prefix}_${suffix}`.slice(0, 20);
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.usernameLower, candidate.toLowerCase())).limit(1);
    if (!taken) return candidate;
  }
  return `tg_${String(telegramId).slice(-10)}`.slice(0, 20);
}

/**
 * Create (or reuse) the web account for a Telegram person.
 *
 * Rule Q3 (decided by the project owner): a Mini App visit always creates a
 * web account for that Telegram id — it never silently attaches to a
 * pre-existing web account.
 */
export async function ensureWebAccountForTelegram(
  telegramId: TelegramId,
  info: { username?: string | null; firstName?: string | null },
  method: "miniapp" | "browser" | "code",
) {
  const tgUser = await ensureTelegramUser(telegramId, info);
  // telegram_links.telegram_id references telegram_users.id (the internal row id),
  // while users.telegram_id holds the real Telegram id.
  const [link] = await db.select().from(telegramLinks).where(eq(telegramLinks.telegramId, tgUser.id)).limit(1);

  if (link?.userId) {
    const [existing] = await db.select().from(users).where(eq(users.id, link.userId)).limit(1);
    if (existing) {
      await db.update(telegramLinks).set({ lastSeenAt: new Date() }).where(eq(telegramLinks.telegramId, tgUser.id));
      return { user: existing, created: false, telegramUserId: tgUser.id };
    }
  }

  const displayName = sanitizeDisplayName(info.firstName);
  const username = await generateTelegramUsername(telegramId, info.username ?? null);

  let user: typeof users.$inferSelect | undefined;
  try {
    [user] = await db
      .insert(users)
      .values({
        username,
        usernameLower: username.toLowerCase(),
        // No password: the account is reached through Telegram only.
        passwordHash: `!tg:${randomBytes(24).toString("hex")}`,
        displayName,
        source: method === "miniapp" ? "miniapp" : "telegram",
        // The real Telegram id, so it stays unique per person.
        telegramId,
        role: "member",
      })
      .returning();
  } catch (err) {
    // Two Mini App tabs opened at the same time can both try to create the
    // account; the unique index on users.telegram_id stops the second one.
    // In that case the account that already exists is used.
    if (!isUniqueViolation(err)) throw err;
    const [existing] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
    if (!existing) throw err;
    user = existing;
  }

  await db
    .insert(telegramLinks)
    .values({ telegramId: tgUser.id, userId: user.id, method, lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: telegramLinks.telegramId,
      set: { userId: user.id, method, lastSeenAt: new Date() },
    });

  return { user, created: true, telegramUserId: tgUser.id };
}

/** Whether the error is a unique constraint violation. */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "23505") return true;
  const message = err instanceof Error ? err.message : "";
  return message.includes("users_telegram_id_uq") || message.includes("duplicate key");
}

/* ------------------------------------------------------------------ *
 * One-time link codes
 * ------------------------------------------------------------------ */

/** Characters that cannot be confused with each other when read aloud. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateLinkCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i += 1) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

export const hashLinkCode = (code: string) => createHash("sha256").update(code).digest("hex");

export const LINK_CODE_TTL_MS = 15 * 60_000;

/** Create a fresh link code for a web account. Only the hash is stored. */
export async function createLinkCode(userId: number, botId: string) {
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  const code = generateLinkCode();
  await db.insert(telegramLinkCodes).values({
    codeHash: hashLinkCode(code),
    userId,
    botId,
    expiresAt,
  });
  return { code, expiresAt };
}

/** Consume a link code. Returns the owning web account, or null if invalid. */
export async function consumeLinkCode(code: string) {
  const hash = hashLinkCode(code);
  const [row] = await db.select().from(telegramLinkCodes).where(eq(telegramLinkCodes.codeHash, hash)).limit(1);
  if (!row) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user) return null;
  await db.update(telegramLinkCodes).set({ usedAt: new Date() }).where(eq(telegramLinkCodes.codeHash, hash));
  return { user, botId: row.botId };
}

/* ------------------------------------------------------------------ *
 * Bot selection
 * ------------------------------------------------------------------ */

/** Live bots that may be used for sending. */
export async function liveBots() {
  return db
    .select()
    .from(telegramBots)
    .where(and(eq(telegramBots.status, "live"), eq(telegramBots.autoResponder, true)));
}

/**
 * Pick a bot for a message, weighted by `weight`.
 * Returns null when no bot is available — the caller must not send anything.
 */
export function pickBot(bots: (typeof telegramBots.$inferSelect)[]): (typeof telegramBots.$inferSelect) | null {
  if (!bots.length) return null;
  const total = bots.reduce((sum, b) => sum + Math.max(1, b.weight), 0);
  let roll = randomInt(1, total + 1);
  for (const bot of bots) {
    roll -= Math.max(1, bot.weight);
    if (roll <= 0) return bot;
  }
  return bots[bots.length - 1];
}

/** A random live bot — used when the visitor picks a bot for the deep link. */
export async function randomLiveBot() {
  const bots = await liveBots();
  if (!bots.length) return null;
  return bots[randomInt(0, bots.length)];
}

/* ------------------------------------------------------------------ *
 * Opt-out and status
 * ------------------------------------------------------------------ */

/** Mark a Telegram person as not wanting any more messages. */
export async function setOptOut(telegramId: TelegramId, optedOut: boolean) {
  const row = await ensureTelegramUser(telegramId);
  await db
    .update(telegramUsers)
    .set({
      optOut: optedOut,
      optedOutAt: optedOut ? new Date() : null,
      notifyEnabled: !optedOut,
      updatedAt: new Date(),
    })
    .where(eq(telegramUsers.id, row.id));
}

/** Set the reachability status reported by the bot (active / blocked / invalid). */
export async function setTelegramStatus(telegramId: TelegramId, status: "unknown" | "active" | "blocked" | "invalid") {
  await db
    .update(telegramUsers)
    .set({ status, updatedAt: new Date() })
    .where(eq(telegramUsers.telegramId, telegramId));
}

/**
 * Read the Telegram error of a failed send and decide what it means for the id.
 *
 * Telegram answers with a few different messages, and they lead to different
 * decisions:
 *  - "chat not found" — the id is wrong or the account is gone → invalid
 *  - "bot was blocked by the user" / "user is blocked" → blocked
 *  - "bot was kicked" → blocked
 *  - "chat not found" with "deactivated" → invalid
 *
 * Anything else (a network error, a flood wait) says nothing about the id and
 * returns null so the id keeps its status.
 */
export function telegramFailureReason(
  error: string,
): "blocked" | "invalid" | null {
  const text = error.toLowerCase();
  if (
    text.includes("bot was blocked by the user") ||
    text.includes("user is blocked") ||
    text.includes("bot was kicked") ||
    text.includes("user_deactivated") ||
    text.includes("bot can't initiate conversation") ||
    text.includes("forbidden: bot was blocked")
  ) {
    return "blocked";
  }
  if (
    text.includes("chat not found") ||
    text.includes("chat_invalid") ||
    text.includes("peer_id_invalid") ||
    text.includes("user not found") ||
    text.includes("deactivated")
  ) {
    return "invalid";
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Targeting helpers
 * ------------------------------------------------------------------ */

/** Linked accounts that never came back for a while (target "hồi sinh"). */
export async function stalledTelegramIds(days: number) {
  const cutoff = new Date(Date.now() - days * 86400_000);
  return db
    .select({ telegramId: telegramUsers.telegramId })
    .from(telegramLinks)
    .innerJoin(telegramUsers, eq(telegramUsers.id, telegramLinks.telegramId))
    .where(or(isNull(telegramLinks.lastSeenAt), lt(telegramLinks.linkedAt, cutoff)));
}

/** Whether a Telegram person already received a given campaign. */
export async function alreadyDelivered(campaignId: string, telegramId: TelegramId): Promise<boolean> {
  const [row] = await db
    .select({ sentAt: deliveryLog.sentAt })
    .from(deliveryLog)
    .where(and(eq(deliveryLog.campaignId, campaignId), eq(deliveryLog.telegramId, telegramId)))
    .limit(1);
  return !!row;
}

/**
 * Whether the same content was already delivered in the last N days.
 * The content hash is stored in `delivery_log.error` next to the status.
 */
export async function recentlyDeliveredContent(telegramId: TelegramId, textHash: string, days: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - days * 86400_000);
  const rows = await db
    .select({ error: deliveryLog.error })
    .from(deliveryLog)
    .where(and(eq(deliveryLog.telegramId, telegramId), gt(deliveryLog.sentAt, cutoff)));
  return rows.some((r) => r.error === textHash);
}

/** Remove expired link codes. */
export async function purgeExpiredLinkCodes() {
  await db.delete(telegramLinkCodes).where(lt(telegramLinkCodes.expiresAt, new Date()));
}

/** Raw SQL helper for the scheduler: telegram ids with an account, filtered. */
export function linkedTelegramIdsSql() {
  return sql`select telegram_id from telegram_links where user_id is not null`;
}
