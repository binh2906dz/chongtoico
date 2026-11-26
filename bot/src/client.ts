/**
 * HTTP client for the web app API.
 *
 * Every call carries the `X-Bot-Secret` header. The secret and the Telegram
 * tokens are never written to the log.
 */

import { config } from "./config.js";

export class WebApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Web API trả về ${status}: ${body.slice(0, 200)}`);
    this.name = "WebApiError";
  }
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call the web app API. Network errors and 5xx answers are retried with an
 * exponential backoff; 4xx answers are returned to the caller straight away.
 */
export async function callWebApi<T>(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  const url = `${config.apiUrl}${path}`;
  const timeoutMs = init.timeoutMs ?? 15_000;
  let lastError: unknown;

  for (let attempt = 0; attempt < 4; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "X-Bot-Secret": config.apiSecret,
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        const error = new WebApiError(res.status, text);
        if (!RETRYABLE.has(res.status)) throw error;
        lastError = error;
      } else {
        return (text ? JSON.parse(text) : {}) as T;
      }
    } catch (err) {
      if (err instanceof WebApiError && !RETRYABLE.has(err.status)) throw err;
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
    await sleep(Math.min(500 * 2 ** attempt, 4000));
  }
  throw lastError instanceof Error ? lastError : new Error("Không gọi được API web.");
}

/* ------------------------------------------------------------------ *
 * The shapes the bot service needs from the web app
 * ------------------------------------------------------------------ */

export interface JobPayload {
  text: string;
  parseMode: string;
  buttons: { label: string; url: string }[];
  webUrl: string;
  media: { kind: string; url: string; sizeBytes: number; isPublic: boolean } | null;
  contentHash?: string;
}

export interface Job {
  jobId: number;
  campaignId: string;
  telegramId: number;
  botId: string | null;
  payload: JobPayload;
}

export interface BotInfo {
  id: string;
  username: string | null;
  displayName: string | null;
  status: string;
  weight: number;
}

/** One button of the reply keyboard. */
export interface KeyboardCell {
  label: string;
  type: "text" | "url" | "webapp" | "open_site" | "remove_keyboard" | "stats";
  body?: string;
  url?: string;
  albumId?: string;
}

/** The reply keyboard the admin configured on the web. */
export interface KeyboardConfig {
  enabled: boolean;
  prompt: string;
  rows: KeyboardCell[][];
}

/** The slogans the admin configured on the web. */
export interface SloganConfig {
  enabled: boolean;
  items: { text: string; delayAfter: number }[];
}

/** One greeting the bot can send when somebody presses /start. */
export interface GreetingItem {
  id: string;
  text: string;
}

/** The greeting the admin configured on the web. */
export interface GreetingConfig {
  enabled: boolean;
  /** Keep the buttons of the current /start answer. */
  keepButtons: boolean;
  items: GreetingItem[];
}

/** The settings the bot needs to build its reply keyboard. */
export interface BotSettings {
  keyboard: KeyboardConfig;
  slogans: SloganConfig;
  greeting: GreetingConfig;
}

/** Read the reply keyboard and the slogans from the web app. */
export function fetchSettings(): Promise<BotSettings> {
  return callWebApi<BotSettings>("/api/bot/settings");
}

/** Fetch the jobs that are due right now. */
export function fetchJobs(limit = 20): Promise<{ jobs: Job[] }> {
  return callWebApi<{ jobs: Job[] }>(`/api/bot/jobs?limit=${limit}`);
}

/** Report the outcome of a job. */
export function reportResult(
  jobId: number,
  status: "sent" | "failed" | "blocked" | "skipped",
  extra: { error?: string; botId?: string } = {},
): Promise<{ ok: boolean }> {
  return callWebApi("/api/bot/result", {
    method: "POST",
    body: { jobId, status, error: extra.error ?? null, botId: extra.botId ?? null },
  });
}

/** Register this bot with the web app. */
export function registerBot(botId: string, username: string, displayName: string): Promise<unknown> {
  return callWebApi("/api/bot/register", { method: "POST", body: { botId, username, displayName } });
}

/** Report the health of this bot. */
export function sendHeartbeat(botId: string, status: string, users: string[] = []): Promise<unknown> {
  return callWebApi("/api/bot/heartbeat", { method: "POST", body: { botId, status, users } });
}

/** Tell the web app the user pressed /start. */
export function reportStart(
  telegramId: number,
  botId: string,
  info: { username?: string; firstName?: string; code?: string } = {},
): Promise<unknown> {
  return callWebApi("/api/bot/start", {
    method: "POST",
    body: {
      telegramId,
      botId,
      username: info.username ?? null,
      firstName: info.firstName ?? null,
      code: info.code ?? null,
    },
  });
}

/** Confirm a link code with the web app. */
export function reportLink(
  code: string,
  telegramId: number,
  botId: string,
  info: { username?: string; firstName?: string } = {},
): Promise<{ linked: boolean; username?: string | null; userId?: number | null }> {
  return callWebApi("/api/bot/link", {
    method: "POST",
    body: {
      code,
      telegramId,
      botId,
      username: info.username ?? null,
      firstName: info.firstName ?? null,
    },
  });
}

/** Tell the web app the user opted out. */
export function reportOptOut(telegramId: number, botId: string): Promise<unknown> {
  return callWebApi("/api/bot/optout", { method: "POST", body: { telegramId, botId } });
}

/** Read the state of a single Telegram person. */
export function fetchUserState(
  telegramId: number,
): Promise<{ linked: boolean; optOut: boolean; notifyEnabled: boolean; username?: string | null }> {
  return callWebApi(`/api/bot/user/${telegramId}`);
}

/** Ask the web app to verify Telegram initData. */
export function verifyInitData(initData: string): Promise<{
  ok: boolean;
  telegramId?: number;
  username?: string | null;
  firstName?: string | null;
  authDate?: number;
  error?: string;
}> {
  return callWebApi("/internal/verify", { method: "POST", body: { initData } });
}
