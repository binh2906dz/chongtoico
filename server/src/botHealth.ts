/**
 * Daily health check of the Telegram bots.
 *
 * Telegram can ban a bot at any moment. When that happens the bot must not be
 * used any more (the bot service already stops using it) and the admin has to
 * hear about it. This module checks every bot against Telegram once a day and
 * writes a new row into `telegram_bot_incidents` for every fresh ban.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { telegramBotIncidents, telegramBots } from "./db/schema.js";
import { decryptToken } from "./crypto.js";

/** How often the bots are checked. Once a day, as the admin asked. */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

let lastCheckAt = 0;
let timer: NodeJS.Timeout | null = null;

/** Ask Telegram who this bot is. */
async function verifyToken(token: string): Promise<{ ok: boolean; error?: string; username?: string | null; telegramId?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(15_000) });
    if (res.status === 401) return { ok: false, error: "Bot bị Telegram cấm (401 Unauthorized)." };
    if (!res.ok) return { ok: false, error: `Telegram trả về HTTP ${res.status}.` };
    const data = (await res.json()) as { ok?: boolean; result?: { username?: string; id?: number } };
    if (!data.ok || !data.result) return { ok: false, error: "Telegram không trả về thông tin bot." };
    return { ok: true, username: data.result.username ?? null, telegramId: data.result.id != null ? String(data.result.id) : undefined };
  } catch {
    return { ok: false, error: "Không kết nối được Telegram để kiểm tra token." };
  }
}

/**
 * Check every bot once.
 *
 * Returns the number of bots that are banned now. The function is safe to
 * call at any time; the daily timer only decides when it runs.
 */
export async function checkAllBots(): Promise<{ checked: number; banned: number; newBans: string[] }> {
  const rows = await db.select().from(telegramBots);
  const now = new Date();
  let banned = 0;
  const newBans: string[] = [];

  for (const bot of rows) {
    if (!bot.tokenEncrypted) continue;
    const token = decryptToken(bot.tokenEncrypted);
    if (!token) continue;

    const check = await verifyToken(token);
    const previous = bot.status;

    if (check.ok) {
      await db
        .update(telegramBots)
        .set({
          status: "live",
          lastCheckedAt: now,
          lastError: null,
          username: check.username ?? bot.username,
          telegramId: check.telegramId ?? bot.telegramId,
          bannedAt: null,
          lastBanReason: null,
        })
        .where(eq(telegramBots.id, bot.id));
      // A bot that came back to life must not be reported as banned again.
      if (previous === "ban") {
        await db.delete(telegramBotIncidents).where(and(eq(telegramBotIncidents.botId, bot.id), eq(telegramBotIncidents.kind, "ban")));
      }
      continue;
    }

    const isBan = /401|cấm|thu hồi/i.test(check.error ?? "");
    await db
      .update(telegramBots)
      .set({
        status: isBan ? "ban" : "error",
        lastCheckedAt: now,
        lastError: check.error ?? "Không kiểm tra được bot.",
        bannedAt: isBan ? now : bot.bannedAt,
        lastBanReason: isBan ? check.error : bot.lastBanReason,
      })
      .where(eq(telegramBots.id, bot.id));

    if (isBan) {
      banned++;
      // Only a NEW ban is worth an entry in the report.
      if (previous !== "ban") {
        await db.insert(telegramBotIncidents).values({
          botId: bot.id,
          botUsername: bot.username,
          kind: "ban",
          message: check.error ?? "Bot bị Telegram cấm (401).",
          detectedAt: now,
        });
        newBans.push(bot.displayName ?? bot.username ?? bot.id);
      }
    }
  }

  lastCheckAt = Date.now();
  return { checked: rows.length, banned, newBans };
}

/** Start the daily check. The first run happens shortly after the start. */
export function startBotHealthCheck(log: (msg: string) => void): void {
  const first = setTimeout(() => {
    void runCheck(log);
  }, 60_000);
  first.unref();
  timer = setInterval(() => void runCheck(log), CHECK_INTERVAL_MS);
  timer.unref();
  log("bot health check started (daily)");
}

export function stopBotHealthCheck(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** When the last check ran — shown in the admin panel. */
export function lastHealthCheckAt(): number {
  return lastCheckAt;
}

async function runCheck(log: (msg: string) => void): Promise<void> {
  try {
    const result = await checkAllBots();
    if (result.newBans.length) {
      log(`⚠️ ${result.newBans.length} bot mới bị Telegram ban: ${result.newBans.join(", ")}`);
    } else {
      log(`bot health check: ${result.checked} bot, ${result.banned} bị ban`);
    }
  } catch (err) {
    log(`bot health check failed: ${(err as Error).message}`);
  }
}

/** The newest incidents, used by the admin panel. */
export async function recentIncidents(limit = 50) {
  return db.select().from(telegramBotIncidents).orderBy(desc(telegramBotIncidents.detectedAt)).limit(limit);
}
