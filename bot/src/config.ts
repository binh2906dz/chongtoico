/**
 * Configuration of the Telegram bot service.
 *
 * The bot service is deliberately separate from the web app: it is the only
 * place where Telegram bot tokens live. It talks to the web app over HTTP using
 * the shared `X-Bot-Secret` header.
 */

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Parse the comma separated list of `id:token` pairs. */
export function parseBotTokens(raw: string | undefined): { id: string; token: string }[] {
  if (!raw) return [];
  const out: { id: string; token: string }[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf(":");
    if (sep <= 0) continue;
    const id = trimmed.slice(0, sep).trim();
    const token = trimmed.slice(sep + 1).trim();
    if (!id || !token) continue;
    out.push({ id, token });
  }
  return out;
}

export const config = {
  /** Base URL of the web app API. */
  apiUrl: (process.env.BOT_API_URL || "http://127.0.0.1:8090").replace(/\/+$/, ""),
  /** Shared secret sent as `X-Bot-Secret` on every call to the web app. */
  apiSecret: process.env.BOT_API_SECRET || "",
  /** Port of the internal verify endpoint. It only binds to 127.0.0.1. */
  internalPort: int(process.env.BOT_INTERNAL_PORT, 8091),
  internalHost: process.env.BOT_INTERNAL_HOST || "127.0.0.1",
  /** Telegram bot tokens, format `id:token,id:token`. */
  botTokens: parseBotTokens(process.env.TELEGRAM_BOT_TOKENS),
  /** Public base URL of the website, used to build the deep links. */
  webBaseUrl: (process.env.WEB_BASE_URL || "http://127.0.0.1:8090").replace(/\/+$/, ""),
  /** Telegram chat id that receives service alerts (optional). */
  adminChatId: process.env.ADMIN_CHAT_ID || "",
  /** How often the job queue is polled, in milliseconds. */
  pollIntervalMs: int(process.env.BOT_POLL_INTERVAL_MS, 4000),
  /** How often the queue is polled while there is a lot of work, in milliseconds. */
  busyPollIntervalMs: int(process.env.BOT_BUSY_POLL_INTERVAL_MS, 300),
  /** How many jobs are taken from the queue in one round. */
  jobBatchSize: int(process.env.BOT_JOB_BATCH_SIZE, 100),
  /** How often the bot reports its health, in milliseconds. */
  heartbeatIntervalMs: int(process.env.BOT_HEARTBEAT_INTERVAL_MS, 300_000),
  /** Messages sent per second, per bot. Telegram allows about 30. */
  sendRatePerSecond: int(process.env.BOT_SEND_RATE, 25),
  /** A bot that failed with 429 is skipped for this many minutes. */
  cooldownAfter429Minutes: int(process.env.BOT_429_COOLDOWN_MINUTES, 60),
  /** The longest wait a bot takes after a 429, in seconds. */
  maxCooldownAfter429Seconds: int(process.env.BOT_MAX_429_COOLDOWN_SECONDS, 300),
  /** How long a cached bot token list stays valid, in milliseconds. */
  tokenCacheMs: int(process.env.BOT_TOKEN_CACHE_MS, 300_000),
  logLevel: process.env.LOG_LEVEL || "info",
  /** Set to false in tests so the service does not open real Telegram connections. */
  enableTelegram: bool(process.env.BOT_ENABLE_TELEGRAM, true),
};

export type Config = typeof config;
