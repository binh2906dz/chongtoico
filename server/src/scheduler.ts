import { createHash } from "node:crypto";
import { and, count, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { config } from "./config.js";
import { db } from "./db/index.js";
import {
  articles,
  articleImages,
  articleVideos,
  deliveryLog,
  notificationJobs,
  telegramCampaigns,
  telegramLinks,
  telegramSettings,
  telegramUsers,
} from "./db/schema.js";
import { liveBots, pickBot } from "./telegram.js";

/* ------------------------------------------------------------------ *
 * Frequency rules (hard limits — the admin cannot go beyond them)
 *
 *  - at most 1 message per person per day
 *  - at most 3 messages per person per week
 *  - at least 6 hours between two messages
 *  - only between 08:00 and 22:00 Vietnam time
 * ------------------------------------------------------------------ */

export const MAX_PER_DAY = 1;
export const MAX_PER_WEEK = 3;
export const MIN_HOURS_BETWEEN = 6;
export const SEND_HOUR_START = 8;
export const SEND_HOUR_END = 22;

/** Vietnam is UTC+7 all year. */
const VN_OFFSET_MINUTES = 7 * 60;

export function vietnamNow(date = new Date()) {
  const shifted = new Date(date.getTime() + VN_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
    date: shifted,
  };
}

/**
 * The next moment inside the sending window (08:00–22:00 Vietnam time).
 *
 * Vietnam is UTC+7, so 08:00 Vietnam is 01:00 UTC of the same calendar day.
 */
export function nextAllowedTime(from = new Date()): Date {
  const vn = vietnamNow(from);
  // Minutes since midnight in Vietnam.
  const minutesNow = vn.hour * 60 + vn.minute;
  const startMinutes = SEND_HOUR_START * 60;
  const endMinutes = SEND_HOUR_END * 60;

  // The UTC instant of 08:00 Vietnam on the current Vietnam calendar day.
  const dayStartUtc = Date.UTC(vn.year, vn.month, vn.day) - VN_OFFSET_MINUTES * 60_000;
  const startOfWindow = dayStartUtc + startMinutes * 60_000;

  if (minutesNow < startMinutes) return new Date(startOfWindow);
  if (minutesNow >= endMinutes) return new Date(startOfWindow + 86400_000);
  return from;
}

/** The UTC instant for a given Vietnam wall-clock time on a given day. */
function vietnamInstant(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month, day, hour, minute) - VN_OFFSET_MINUTES * 60_000);
}

/* ------------------------------------------------------------------ *
 * Targeting
 * ------------------------------------------------------------------ */

export interface TargetUser {
  telegramId: number;
  userId: number | null;
}

/** The Telegram people a campaign should be sent to. */
export async function resolveTargets(
  targetType: string,
  targetIds: Array<number | string>,
): Promise<TargetUser[]> {
  switch (targetType) {
    case "ids": {
      const ids = targetIds
        .map((x) => Number(x))
        .filter((x) => Number.isInteger(x) && x > 0);
      if (!ids.length) return [];
      const rows = await db
        .select({ telegramId: telegramUsers.telegramId, userId: telegramLinks.userId })
        .from(telegramUsers)
        .leftJoin(telegramLinks, eq(telegramLinks.telegramId, telegramUsers.id))
        .where(inArray(telegramUsers.telegramId, ids));
      return rows;
    }
    case "status": {
      const statuses = targetIds.map((x) => String(x)).filter(Boolean);
      if (!statuses.length) return [];
      const rows = await db
        .select({ telegramId: telegramUsers.telegramId, userId: telegramLinks.userId })
        .from(telegramUsers)
        .leftJoin(telegramLinks, eq(telegramLinks.telegramId, telegramUsers.id))
        .where(inArray(telegramUsers.status, statuses));
      return rows;
    }
    case "visited": {
      // People who opened the website at least once.
      const rows = await db
        .select({ telegramId: telegramUsers.telegramId, userId: telegramLinks.userId })
        .from(telegramUsers)
        .innerJoin(telegramLinks, eq(telegramLinks.telegramId, telegramUsers.id))
        .where(isNotNull(telegramLinks.lastSeenAt));
      return rows;
    }
    case "stalled": {
      // Linked accounts that have not come back for 14 days.
      const cutoff = new Date(Date.now() - 14 * 86400_000);
      const rows = await db
        .select({ telegramId: telegramUsers.telegramId, userId: telegramLinks.userId })
        .from(telegramUsers)
        .innerJoin(telegramLinks, eq(telegramLinks.telegramId, telegramUsers.id))
        .where(or(isNull(telegramLinks.lastSeenAt), lt(telegramLinks.linkedAt, cutoff)));
      return rows;
    }
    case "all_linked":
    default: {
      const rows = await db
        .select({ telegramId: telegramUsers.telegramId, userId: telegramLinks.userId })
        .from(telegramUsers)
        .innerJoin(telegramLinks, eq(telegramLinks.telegramId, telegramUsers.id))
        .where(isNotNull(telegramLinks.userId));
      return rows;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Frequency guards
 * ------------------------------------------------------------------ */

/** Whether a person may receive another message right now. */
export async function mayReceive(
  telegramId: number,
  campaignId: string,
  contentHashValue: string,
): Promise<{ ok: boolean; reason?: string }> {
  const [tgUser] = await db.select().from(telegramUsers).where(eq(telegramUsers.telegramId, telegramId)).limit(1);
  if (!tgUser) return { ok: false, reason: "unknown_user" };
  if (tgUser.optOut) return { ok: false, reason: "opted_out" };
  if (!tgUser.notifyEnabled) return { ok: false, reason: "notifications_off" };
  if (tgUser.status === "blocked") return { ok: false, reason: "blocked" };

  // Already received this campaign.
  const [same] = await db
    .select({ id: deliveryLog.campaignId })
    .from(deliveryLog)
    .where(and(eq(deliveryLog.campaignId, campaignId), eq(deliveryLog.telegramId, telegramId)))
    .limit(1);
  if (same) return { ok: false, reason: "already_received_campaign" };

  // The same content within the last 7 days.
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const recent = await db
    .select({ error: deliveryLog.error })
    .from(deliveryLog)
    .where(and(eq(deliveryLog.telegramId, telegramId), gte(deliveryLog.sentAt, weekAgo)));
  if (recent.some((r) => r.error === contentHashValue)) return { ok: false, reason: "same_content_recently" };

  // 1 per day.
  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const [perDay] = await db
    .select({ n: count() })
    .from(deliveryLog)
    .where(and(eq(deliveryLog.telegramId, telegramId), gte(deliveryLog.sentAt, dayAgo)));
  if ((perDay?.n ?? 0) >= MAX_PER_DAY) return { ok: false, reason: "daily_limit" };

  // 3 per week.
  const [perWeek] = await db
    .select({ n: count() })
    .from(deliveryLog)
    .where(and(eq(deliveryLog.telegramId, telegramId), gte(deliveryLog.sentAt, weekAgo)));
  if ((perWeek?.n ?? 0) >= MAX_PER_WEEK) return { ok: false, reason: "weekly_limit" };

  // At least 6 hours between two messages.
  const sixHoursAgo = new Date(Date.now() - MIN_HOURS_BETWEEN * 3600_000);
  const [lastSent] = await db
    .select({ sentAt: deliveryLog.sentAt })
    .from(deliveryLog)
    .where(and(eq(deliveryLog.telegramId, telegramId), gte(deliveryLog.sentAt, sixHoursAgo)))
    .orderBy(sql`${deliveryLog.sentAt} desc`)
    .limit(1);
  if (lastSent) return { ok: false, reason: "too_soon" };

  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Building the Telegram message payload
 * ------------------------------------------------------------------ */

export interface CampaignPayload {
  text: string;
  parseMode: "HTML";
  buttons: { label: string; url: string }[];
  webUrl: string;
  media: { kind: string; url: string; sizeBytes: number; isPublic: boolean } | null;
  /** Hash of the original campaign text, used to detect repeated content. */
  contentHash: string;
}

/** Escape the admin text so it can be embedded in a Telegram HTML message. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function contentHashOf(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex").slice(0, 32);
}

/** Build the payload the bot will send. */
export async function buildPayload(
  campaign: typeof telegramCampaigns.$inferSelect,
  telegramId: number,
): Promise<CampaignPayload> {
  const base = config.siteUrl;
  const rawButtons = (campaign.buttons ?? []) as { label: string; url: string }[];
  const buttons = rawButtons.map((b) => ({
    label: escapeHtml(String(b.label)).slice(0, 40),
    url: String(b.url),
  }));
  // The standard buttons every message carries.
  const allButtons = [
    { label: "🌐 Mở Website", url: `${base}/?ref=bot&cid=${campaign.id}&tid=${telegramId}&src=push` },
    { label: "🔕 Từ chối nhận", url: `${base}/tg/stop?tid=${telegramId}&cid=${campaign.id}` },
    ...buttons,
  ];

  let media: CampaignPayload["media"] = null;
  if (campaign.mediaType && campaign.mediaKey) {
    // mediaKey format: "<kind>:<fileKey>" or "<kind>:<fileKey>.<ext>" for videos.
    const raw = campaign.mediaKey;
    const sep = raw.indexOf(":");
    const kind = sep === -1 ? campaign.mediaType : raw.slice(0, sep);
    const file = sep === -1 ? raw : raw.slice(sep + 1);
    const isVideo = kind === "video" || campaign.mediaType === "video";
    const ext = file.includes(".") ? file.split(".").pop()! : isVideo ? "mp4" : "webp";
    const key = file.replace(/\.[a-z0-9]+$/i, "");

    // The real file size decides whether Telegram accepts the upload,
    // and members-only files must never leave the server.
    let sizeBytes = 0;
    let isPublic = true;
    if (isVideo) {
      const [row] = await db
        .select({ sizeBytes: articleVideos.sizeBytes, articleId: articleVideos.articleId })
        .from(articleVideos)
        .where(eq(articleVideos.fileKey, key))
        .limit(1);
      sizeBytes = row?.sizeBytes ?? 0;
      if (row) isPublic = !(await isMembersOnlyArticle(row.articleId));
    } else {
      const [row] = await db
        .select({ articleId: articleImages.articleId })
        .from(articleImages)
        .where(eq(articleImages.fileKey, key))
        .limit(1);
      if (row) isPublic = !(await isMembersOnlyArticle(row.articleId));
    }

    media = {
      kind: isVideo ? "video" : "image",
      url: `${base}/media/${isVideo ? "v" : "a"}/${key}.${ext}`,
      sizeBytes,
      isPublic,
    };
  }

  return {
    text: await buildMessageText(campaign, base),
    parseMode: "HTML",
    buttons: allButtons,
    webUrl: `${base}/?ref=bot&cid=${campaign.id}&tid=${telegramId}&src=push`,
    media,
    contentHash: contentHashOf(campaign.text ?? ""),
  };
}

/** Whether an article is only visible to signed-in members. */
async function isMembersOnlyArticle(articleId: number): Promise<boolean> {
  const [row] = await db
    .select({ visibility: articles.visibility })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);
  return row?.visibility === "members";
}

/**
 * Build the message body: the admin text (escaped) plus the linked articles.
 * Links are produced by the server so no raw HTML from the admin can leak.
 */
async function buildMessageText(
  campaign: typeof telegramCampaigns.$inferSelect,
  base: string,
): Promise<string> {
  const body = campaign.text ? escapeHtml(campaign.text) : "";
  const ids = (campaign.articleIds ?? []) as number[];

  // The slogan the admin configured is added at the top of the message.
  const slogan = await firstSlogan();

  if (!ids.length) {
    if (slogan && body) return `${slogan}\n\n${body}`;
    return slogan || body;
  }

  const rows = await db
    .select({ id: articles.id, title: articles.title })
    .from(articles)
    .where(inArray(articles.id, ids));
  if (!rows.length) {
    if (slogan && body) return `${slogan}\n\n${body}`;
    return slogan || body;
  }

  const links = rows
    .map((a) => `👉 <a href="${base}/bai-viet/${a.id}">${escapeHtml(a.title)}</a>`)
    .join("\n");
  if (slogan) {
    return body ? `${slogan}\n\n${body}\n${links}` : `${slogan}\n\n${links}`;
  }
  return body ? `${body}\n${links}` : links;
}

/**
 * The first slogan of the slogan list, when the admin turned slogans on.
 *
 * The list is stored in the settings table, so the whole list is read and the
 * first entry is used.
 */
async function firstSlogan(): Promise<string> {
  const [row] = await db
    .select({ value: telegramSettings.value })
    .from(telegramSettings)
    .where(eq(telegramSettings.key, "slogans"))
    .limit(1);
  const cfg = row?.value as { enabled?: boolean; items?: { text?: string }[] } | undefined;
  if (!cfg?.enabled) return "";
  const text = (cfg.items ?? []).map((item) => String(item.text ?? "").trim()).find(Boolean);
  return text ? escapeHtml(text) : "";
}

/* ------------------------------------------------------------------ *
 * Creating the jobs of a campaign
 * ------------------------------------------------------------------ */

export interface QueueResult {
  queued: number;
  skipped: number;
  skippedReasons: Record<string, number>;
}

/**
 * Turn a campaign into jobs, honouring every frequency rule.
 * The bot only ever receives jobs that are allowed to be sent.
 */
export async function queueCampaign(campaignId: string, scheduledAt: Date): Promise<QueueResult> {
  const [campaign] = await db.select().from(telegramCampaigns).where(eq(telegramCampaigns.id, campaignId)).limit(1);
  if (!campaign) return { queued: 0, skipped: 0, skippedReasons: {} };

  const bots = await liveBots();
  if (!bots.length) {
    // No bot available — nothing may be sent.
    await db
      .update(telegramCampaigns)
      .set({ status: "paused", scheduleStatus: "paused", updatedAt: new Date() })
      .where(eq(telegramCampaigns.id, campaignId));
    return { queued: 0, skipped: 0, skippedReasons: { no_live_bot: 1 } };
  }

  const targets = await resolveTargets(campaign.targetType, (campaign.targetIds ?? []) as Array<number | string>);
  const hash = contentHashOf(campaign.text ?? "");
  const skippedReasons: Record<string, number> = {};
  let skipped = 0;
  let queued = 0;
  const rows: (typeof notificationJobs.$inferInsert)[] = [];

  // A job that already exists for this campaign and person blocks a second one,
  // even when the first one has not been delivered yet.
  const existingJobs = await db
    .select({ telegramId: notificationJobs.telegramId })
    .from(notificationJobs)
    .where(
      and(
        eq(notificationJobs.campaignId, campaignId),
        inArray(notificationJobs.status, ["queued", "sending"]),
      ),
    );
  const alreadyQueued = new Set(existingJobs.map((j) => j.telegramId));

  for (const target of targets) {
    if (alreadyQueued.has(target.telegramId)) {
      skipped += 1;
      skippedReasons.already_queued = (skippedReasons.already_queued ?? 0) + 1;
      continue;
    }
    const check = await mayReceive(target.telegramId, campaignId, hash);
    if (!check.ok) {
      skipped += 1;
      skippedReasons[check.reason ?? "unknown"] = (skippedReasons[check.reason ?? "unknown"] ?? 0) + 1;
      continue;
    }
    const bot = pickBot(bots);
    const payload = await buildPayload(campaign, target.telegramId);
    rows.push({
      campaignId,
      telegramId: target.telegramId,
      botId: bot?.id ?? null,
      payload,
      status: "queued",
      scheduledAt,
    });
    queued += 1;
  }

  if (rows.length) {
    await db.insert(notificationJobs).values(rows);
  }

  await db
    .update(telegramCampaigns)
    .set({ total: queued, status: queued > 0 ? "queued" : "done", updatedAt: new Date() })
    .where(eq(telegramCampaigns.id, campaignId));

  return { queued, skipped, skippedReasons };
}

/* ------------------------------------------------------------------ *
 * The scheduler
 * ------------------------------------------------------------------ */

let timer: NodeJS.Timeout | null = null;

/** Return jobs that were handed out but never reported back to the queue. */
export async function requeueStuckJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - 10 * 60_000);
  const stuck = await db
    .select({ id: notificationJobs.id })
    .from(notificationJobs)
    .where(and(eq(notificationJobs.status, "sending"), lt(notificationJobs.scheduledAt, cutoff)));
  if (!stuck.length) return 0;
  await db
    .update(notificationJobs)
    .set({ status: "queued" })
    .where(inArray(notificationJobs.id, stuck.map((s) => s.id)));
  return stuck.length;
}

/** Move campaigns whose schedule is due into the queue. */
export async function runSchedulerTick(): Promise<void> {
  try {
    const now = new Date();
    const vn = vietnamNow(now);

    // Campaigns whose scheduled moment has arrived.
    const due = await db
      .select()
      .from(telegramCampaigns)
      .where(
        and(
          eq(telegramCampaigns.scheduleStatus, "active"),
          inArray(telegramCampaigns.schedule, ["now", "at"]),
          isNotNull(telegramCampaigns.scheduledAt),
          lte(telegramCampaigns.scheduledAt, now),
        ),
      );

    for (const campaign of due) {
      await queueCampaign(campaign.id, now);
      await db
        .update(telegramCampaigns)
        .set({ scheduleStatus: "done", status: "queued", updatedAt: new Date() })
        .where(eq(telegramCampaigns.id, campaign.id));
    }

    // Daily and weekly schedules: check the hour and minute in Vietnam time.
    const recurring = await db
      .select()
      .from(telegramCampaigns)
      .where(
        and(
          eq(telegramCampaigns.scheduleStatus, "active"),
          inArray(telegramCampaigns.schedule, ["daily", "weekly"]),
        ),
      );

    for (const campaign of recurring) {
      if (campaign.hour !== vn.hour || campaign.minute !== vn.minute) continue;
      if (campaign.schedule === "weekly" && campaign.dayOfWeek !== null && campaign.dayOfWeek !== vn.weekday) continue;
      // Do not send the same recurring campaign twice on the same day.
      const dayStart = vietnamInstant(vn.year, vn.month, vn.day, 0, 0);
      const [already] = await db
        .select({ n: count() })
        .from(notificationJobs)
        .where(
          and(
            eq(notificationJobs.campaignId, campaign.id),
            gte(notificationJobs.createdAt, dayStart),
          ),
        );
      if ((already?.n ?? 0) > 0) continue;
      await queueCampaign(campaign.id, now);
    }

    await requeueStuckJobs();
  } catch (err) {
    console.error(`scheduler tick failed: ${(err as Error).message}`);
  }
}

export function startScheduler(log: (msg: string) => void) {
  const first = setTimeout(() => void runSchedulerTick(), 30_000);
  first.unref();
  timer = setInterval(() => void runSchedulerTick(), 60_000);
  timer.unref();
  log("scheduler started");
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
