/**
 * The job loop of the bot service.
 *
 * The web app decides what is sent, to whom and when. This loop only fetches
 * the jobs that are due, sends them and reports the outcome.
 */

import { GrammyError } from "grammy";
import { fetchJobs, reportResult, type Job } from "./client.js";
import { config } from "./config.js";
import type { BotRegistry } from "./registry.js";

/** Telegram refuses a photo above 10 MB and a video above 50 MB. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export interface SendOutcome {
  status: "sent" | "failed" | "blocked" | "skipped";
  error?: string;
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

/** A tiny rate limiter so one bot never floods Telegram. */
export class RateLimiter {
  private queue: Promise<void> = Promise.resolve();
  private last = 0;

  constructor(private readonly perSecond: number) {}

  /** Run a task, waiting at most `perSecond` tasks per second. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      const wait = 1000 / this.perSecond - (Date.now() - this.last);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      return task();
    });
    // Keep the chain alive even when a task fails.
    this.queue = result.then(
      () => undefined,
      () => undefined,
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
  const bot = registry.pick(job.botId);
  if (!bot || !bot.client) return { status: "failed", error: "Không có bot khỏe để gửi." };

  const plan = planMessage(job);
  const keyboard = buildKeyboard(job);

  try {
    await limiter.run(async () => {
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
    return plan.sendFile ? { status: "sent" } : { status: "sent", error: plan.reason };
  } catch (err) {
    if (err instanceof GrammyError) {
      if (err.error_code === 429) {
        const retryAfter = err.parameters?.retry_after ?? 60;
        registry.markRateLimited(bot.id, retryAfter);
        return { status: "failed", error: `429: chờ ${retryAfter} giây` };
      }
      if (err.error_code === 403) {
        registry.markBanned(bot.id);
        return { status: "blocked", error: "403: người dùng chặn bot." };
      }
      return { status: "failed", error: `Telegram ${err.error_code}: ${err.description}` };
    }
    return { status: "failed", error: err instanceof Error ? err.message : "Lỗi không xác định." };
  }
}

/** One round of the loop: fetch the due jobs, send them and report the result. */
export async function runOnce(registry: BotRegistry, limiter: RateLimiter): Promise<number> {
  const { jobs } = await fetchJobs(20);
  for (const job of jobs ?? []) {
    const outcome = await sendJob(job, registry, limiter);
    try {
      await reportResult(job.jobId, outcome.status, {
        error: outcome.error,
        botId: job.botId ?? undefined,
      });
    } catch {
      // The web app will pick the job up again after the stuck job sweep.
    }
  }
  return jobs?.length ?? 0;
}

/** Run the loop until the process stops. */
export function startJobLoop(registry: BotRegistry): () => void {
  const limiter = new RateLimiter(config.sendRatePerSecond);
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      await runOnce(registry, limiter);
    } catch {
      // A failing round must never stop the loop.
    }
    if (!stopped) timer = setTimeout(tick, config.pollIntervalMs);
  };

  timer = setTimeout(tick, 1000);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
