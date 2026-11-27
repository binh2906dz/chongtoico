/**
 * The job loop of the bot service.
 *
 * The web app decides what is sent, to whom and when. This loop only fetches
 * the jobs that are due, sends them and reports the outcome.
 */

import { GrammyError } from "grammy";
import { fetchJobs, reportResults, type Job, type JobResult } from "./client.js";
import { config } from "./config.js";
import type { BotRegistry, ManagedBot } from "./registry.js";

/** Telegram refuses a photo above 10 MB and a video above 50 MB. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** How often the bots that Telegram refused are checked again. */
const RECHECK_INTERVAL_MS = 5 * 60_000;

export interface SendOutcome {
  status: "sent" | "failed" | "blocked" | "skipped";
  error?: string;
  /** The bot that really carried the message — needed for the statistics. */
  botId?: string;
}

/**
 * Decide how a job has to be sent.
 *
 * A media file that is too big, or that is only visible to members, is never
 * uploaded. The message is sent as a link instead.
 */
export function planMessage(job: Job): { sendFile: boolean; reason?: string } {
  const media = job.payload.media;
  if (!media) return { sendFile: false };
  if (!media.isPublic) return { sendFile: false, reason: "media_not_public" };
  if (media.kind === "image" && media.sizeBytes > MAX_IMAGE_BYTES) {
    return { sendFile: false, reason: "media_too_large" };
  }
  if (media.kind === "video" && media.sizeBytes > MAX_VIDEO_BYTES) {
    return { sendFile: false, reason: "media_too_large" };
  }
  return { sendFile: true };
}

/** Build the inline keyboard of a job. */
export function buildKeyboard(job: Job): { text: string; url: string }[][] {
  const buttons = job.payload.buttons ?? [];
  const rows: { text: string; url: string }[][] = [];
  for (const button of buttons) {
    rows.push([{ text: button.label, url: button.url }]);
  }
  return rows;
}

/**
 * A tiny rate limiter so one bot never floods Telegram.
 *
 * The limit is kept per bot: Telegram counts the messages of every bot on its
 * own, so a bot may send its share while the others send theirs (B104).
 */
export class RateLimiter {
  private readonly last = new Map<string, number>();
  private readonly chains = new Map<string, Promise<void>>();

  constructor(private readonly perSecond: number) {}

  /** Run a task, waiting at most `perSecond` tasks per second for that bot. */
  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const chain = this.chains.get(key) ?? Promise.resolve();
    const result = chain.then(async () => {
      const wait = 1000 / this.perSecond - (Date.now() - (this.last.get(key) ?? 0));
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last.set(key, Date.now());
      return task();
    });
    // Keep the chain alive even when a task fails.
    this.chains.set(
      key,
      result.then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }
}

/**
 * Send one job with the bot chosen by the registry.
 *
 * The function never throws: every failure becomes an outcome the web app can
 * record.
 */
export async function sendJob(job: Job, registry: BotRegistry, limiter: RateLimiter): Promise<SendOutcome> {
  const plan = planMessage(job);
  const keyboard = buildKeyboard(job);

  // The bots that may work for this person. The first entry is the bot the
  // campaign picked, the candidates follow — a bot may only write to a user
  // who started that very bot (B115).
  const candidates = buildCandidates(job, registry);
  if (!candidates.length) return { status: "failed", error: "Không có bot khỏe để gửi." };

  let lastError = "Không có bot khỏe để gửi.";
  let usedBotId: string | undefined;

  for (const bot of candidates) {
    if (!bot.client) continue;
    try {
      await limiter.run(bot.id, async () => {
        if (plan.sendFile && job.payload.media) {
          const media = job.payload.media;
          const file = media.url;
          if (media.kind === "video") {
            await bot.client!.api.sendVideo(job.telegramId, file, {
              caption: job.payload.text,
              parse_mode: "HTML",
              reply_markup: { inline_keyboard: keyboard },
            });
          } else {
            await bot.client!.api.sendPhoto(job.telegramId, file, {
              caption: job.payload.text,
              parse_mode: "HTML",
              reply_markup: { inline_keyboard: keyboard },
            });
          }
          return;
        }
        await bot.client!.api.sendMessage(job.telegramId, job.payload.text, {
          parse_mode: "HTML" as const,
          link_preview_options: { is_disabled: false },
          reply_markup: { inline_keyboard: keyboard },
        });
      });
      bot.sentCount += 1;
      usedBotId = bot.id;
      return plan.sendFile
        ? { status: "sent", error: plan.reason, botId: usedBotId }
        : { status: "sent", error: plan.reason, botId: usedBotId };
    } catch (err) {
      if (err instanceof GrammyError) {
        if (err.error_code === 429) {
          const retryAfter = err.parameters?.retry_after ?? 60;
          registry.markRateLimited(bot.id, retryAfter);
          lastError = `429: chờ ${retryAfter} giây`;
          // Every bot hits the same limit, so trying the next one would only
          // burn the quota of the other bots as well.
          return { status: "failed", error: lastError };
        }
        if (err.error_code === 403) {
          // A 403 has two very different meanings: "bot was blocked by the
          // user" means the USER blocked this bot — the bot itself is still
          // alive and must keep sending to everybody else. Only a bot that
          // Telegram itself blocked may be taken out of the fleet (B115).
          const text = String(err.description ?? "").toLowerCase();
          const userBlocked = text.includes("blocked by the user") || text.includes("user is blocked");
          if (userBlocked) {
            // The bot is fine, only this one person does not want the
            // message. The job ends here, the bot stays in the fleet.
            return { status: "blocked", error: `403: người dùng chặn bot (${bot.id}).` };
          }
          registry.markBanned(bot.id);
          return { status: "blocked", error: "403: bot bị Telegram cấm." };
        }
        if (err.error_code === 400) {
          // "chat not found" — this bot never spoke to this person. Another
          // bot may still have a chat with them (B115).
          lastError = `400: ${err.description}`;
          continue;
        }
        lastError = `Telegram ${err.error_code}: ${err.description}`;
        continue;
      }
      lastError = err instanceof Error ? err.message : "Lỗi không xác định.";
      continue;
    }
  }

  return { status: "failed", error: lastError };
}

/**
 * The bots to try for one job, best candidate first.
 *
 * The bot of the job comes first, then the candidates the web app sent along
 * (the bots the person started on) and finally every other usable bot. A bot
 * that is banned, broken or in a 429 cooldown is skipped.
 */
function buildCandidates(job: Job, registry: BotRegistry): ManagedBot[] {
  const seen = new Set<string>();
  const out: ManagedBot[] = [];
  const push = (id: string | null | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    const bot = registry.get(id);
    if (!bot || !bot.client) return;
    // A bot that was banned gets a second chance once the cooldown is over
    // — Telegram may lift a ban (B115).
    if (bot.health === "error") return;
    if (bot.health === "ban" && bot.cooldownUntil > Date.now()) return;
    if (bot.cooldownUntil > Date.now()) return;
    out.push(bot);
  };
  push(job.botId);
  for (const id of job.candidateBotIds ?? []) push(id);
  // The rest of the registry is the last resort: the person may have started
  // a bot the web app does not know about.
  for (const bot of registry.list()) {
    if (seen.has(bot.id)) continue;
    push(bot.id);
  }
  return out;
}

/**
 * Check the bots that Telegram refused a while ago.
 *
 * A bot that is banned only for a short time gets a second chance: if it
 * answers again, it goes back into the fleet (B115).
 */
export async function recheckBannedBots(registry: BotRegistry): Promise<number> {
  const now = Date.now();
  let checked = 0;
  for (const bot of registry.list()) {
    if (bot.health !== "ban") continue;
    if (bot.cooldownUntil > now) continue;
    const health = await registry.checkHealth(bot.id).catch(() => "ban" as const);
    checked++;
    if (health === "live") {
      // The bot is back — the web app learns about it with the next
      // heartbeat.
      registry.noteAlive(bot.id);
    }
  }
  return checked;
}

/**
 * One round of the loop: fetch the due jobs, send them and report the result.
 *
 * A round keeps taking new batches while the queue still has work, so the
 * bot does not sit idle between two batches (B113).
 */
export async function runOnce(registry: BotRegistry, limiter: RateLimiter): Promise<number> {
  const { jobs } = await fetchJobs(config.jobBatchSize);
  const list = jobs ?? [];
  if (!list.length) return 0;
  let next = 0;
  // The outcomes are collected and reported in one request. One call per job
  // means one round trip per job, and that is what slows a big campaign
  // down the most (B112).
  const results: JobResult[] = [];
  const worker = async (): Promise<void> => {
    while (next < list.length) {
      const job = list[next++];
      if (!job) return;
      const outcome = await sendJob(job, registry, limiter);
      results.push({
        jobId: job.jobId,
        status: outcome.status,
        error: outcome.error,
        botId: outcome.botId ?? job.botId ?? undefined,
      });
    }
  };
  const workers = Array.from(
    { length: Math.min(config.sendConcurrency, list.length) },
    () => worker(),
  );
  await Promise.all(workers);

  // The results travel in a few batches, so a round of 300 jobs needs two
  // requests instead of three hundred.
  const batchSize = 200;
  for (let i = 0; i < results.length; i += batchSize) {
    try {
      await reportResults(results.slice(i, i + batchSize));
    } catch {
      // The web app picks the job up again after the stuck job sweep.
    }
  }
  return list.length;
}

/** Run the loop until the process stops. */
export function startJobLoop(registry: BotRegistry): () => void {
  const limiter = new RateLimiter(config.sendRatePerSecond);
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let lastRecheck = 0;

  const tick = async () => {
    if (stopped) return;
    let handled = 0;
    try {
      // Every few minutes the bots that Telegram refused are checked again,
      // so a bot that came back joins the fleet (B115).
      if (Date.now() - lastRecheck > RECHECK_INTERVAL_MS) {
        lastRecheck = Date.now();
        await recheckBannedBots(registry).catch(() => 0);
      }
      // The loop keeps fetching while the queue has work. Waiting for the
      // poll interval between two full batches would leave the bots idle
      // for most of the time (B113).
      do {
        handled = await runOnce(registry, limiter);
      } while (!stopped && handled > 0);
    } catch {
      // A failing round must never stop the loop.
    }
    // When the queue is empty the bot waits for the next poll.
    const wait = config.pollIntervalMs;
    if (!stopped) timer = setTimeout(tick, wait);
  };

  timer = setTimeout(tick, 1000);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
