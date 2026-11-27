import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { and, count, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { createSession, hashPassword, profileUser, requireAdmin, requireUser } from "../auth.js";
import { db } from "../db/index.js";
import {
  articleImages,
  articleVideos,
  articles,
  deliveryLog,
  notificationJobs,
  telegramBots,
  telegramCampaigns,
  telegramLinks,
  telegramUsers,
  telegramUserLinks,
  telegramVisits,
  users,
} from "../db/schema.js";
import { badRequest, HttpError, notFound, parse } from "../http.js";
import { config } from "../config.js";
import { looksLikeVideo, storeImage, VIDEO_DIR, videoExtFromName } from "../media.js";
import { nextAllowedTime, queueCampaign } from "../scheduler.js";
import {
  applyBotResult,
  candidateBotsFor,
  consumeLinkCode,
  createLinkCode,
  ensureTelegramUser,
  ensureWebAccountForTelegram,
  INIT_DATA_MAX_AGE_SEC,
  isInitDataFresh,
  isValidBotSecret,
  liveBots,
  randomLiveBot,
  recordBotStart,
  setOptOut,
  verifyInitData,
} from "../telegram.js";

/* ------------------------------------------------------------------ *
 * Schemas
 * ------------------------------------------------------------------ */

/** One megabyte in bytes. */
const MB = 1024 * 1024;

const initDataBody = z.object({ initData: z.string().min(1).max(8000) });

/** Sign-up from a normal browser: username + password, then a Telegram link code. */
const browserRegisterBody = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Tên đăng nhập cần ít nhất 3 ký tự.")
    .max(20, "Tên đăng nhập tối đa 20 ký tự.")
    .regex(/^[a-zA-Z0-9_.]+$/, "Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm và gạch dưới."),
  password: z.string().min(6, "Mật khẩu cần ít nhất 6 ký tự.").max(100, "Mật khẩu quá dài."),
  displayName: z.string().trim().max(80).nullish(),
});

const botRegisterBody = z.object({
  botId: z.string().trim().min(1).max(64),
  username: z.string().trim().max(64).nullish(),
  displayName: z.string().trim().max(80).nullish(),
});

const botHeartbeatBody = z.object({
  botId: z.string().trim().min(1).max(64),
  status: z.enum(["live", "ban", "error", "unknown"]),
  users: z.array(z.number().int().positive()).max(10000).optional(),
  error: z.string().max(500).nullish(),
});

const botStartBody = z.object({
  telegramId: z.number().int().positive(),
  botId: z.string().trim().min(1).max(64),
  username: z.string().trim().max(64).nullish(),
  firstName: z.string().trim().max(80).nullish(),
  code: z.string().trim().max(32).nullish(),
});

const botLinkBody = z.object({
  code: z.string().trim().min(4).max(32),
  telegramId: z.number().int().positive(),
  botId: z.string().trim().min(1).max(64),
  username: z.string().trim().max(64).nullish(),
  firstName: z.string().trim().max(80).nullish(),
});

const botResultBody = z.object({
  jobId: z.number().int().positive(),
  status: z.enum(["sent", "failed", "blocked", "skipped"]),
  error: z.string().max(500).nullish(),
  botId: z.string().trim().max(64).nullish(),
});

const trackBody = z.object({
  campaignId: z.string().trim().max(64).nullish(),
  articleId: z.number().int().positive().nullish(),
  path: z.string().trim().max(500).nullish(),
  ref: z.string().trim().max(24).nullish(),
  src: z.string().trim().max(24).nullish(),
  telegramId: z.number().int().positive().nullish(),
});

const optoutPublicBody = z.object({
  tid: z.number().int().positive(),
});

const campaignBody = z.object({
  name: z.string().trim().min(1).max(120),
  text: z.string().max(4000).default(""),
  mediaType: z.enum(["image", "video", "none"]).default("none"),
  mediaKey: z.string().trim().max(64).nullish(),
  mediaSource: z.enum(["article", "upload"]).nullish(),
  mediaNote: z.string().max(500).nullish(),
  buttons: z.array(z.object({ label: z.string().trim().min(1).max(40), url: z.string().trim().url().max(500) })).max(10).default([]),
  articleIds: z.array(z.number().int().positive()).max(20).default([]),
  targetType: z.enum(["all_linked", "visited", "stalled", "status", "ids", "imported"]).default("all_linked"),
  targetIds: z
    .array(z.union([z.number().int().positive(), z.string().trim().min(1).max(32)]))
    .max(100000)
    .default([]),
  /**
   * An emergency campaign skips every frequency rule: it goes out at once,
   * even to people who received a message today.
   */
  isEmergency: z.boolean().default(false),
  schedule: z.enum(["now", "at", "daily", "weekly"]).default("now"),
  hour: z.number().int().min(0).max(23).default(8),
  minute: z.number().int().min(0).max(59).default(0),
  dayOfWeek: z.number().int().min(0).max(6).nullish(),
  scheduledAt: z.string().datetime().nullish(),
});

const campaignPatchBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  text: z.string().max(4000).optional(),
  mediaType: z.enum(["image", "video", "none"]).optional(),
  mediaKey: z.string().trim().max(64).nullish(),
  mediaSource: z.enum(["article", "upload"]).optional(),
  buttons: z.array(z.object({ label: z.string().trim().min(1).max(40), url: z.string().trim().url().max(500) })).max(10).optional(),
  articleIds: z.array(z.number().int().positive()).max(20).optional(),
  targetType: z.enum(["all_linked", "visited", "stalled", "status", "ids", "imported"]).optional(),
  targetIds: z
    .array(z.union([z.number().int().positive(), z.string().trim().min(1).max(32)]))
    .max(100000)
    .optional(),
  isEmergency: z.boolean().optional(),
  schedule: z.enum(["now", "at", "daily", "weekly"]).optional(),
  hour: z.number().int().min(0).max(23).optional(),
  minute: z.number().int().min(0).max(59).optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullish(),
});

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Escape a string so it can be embedded in Telegram HTML messages. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Hash of the message text — used to detect repeated content within 7 days. */
export function contentHash(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex").slice(0, 32);
}

/** The Telegram id stored for a web account (null when not linked). */
async function telegramIdOfUser(userId: number): Promise<number | null> {
  const [link] = await db
    .select({ telegramId: telegramUsers.telegramId })
    .from(telegramLinks)
    .innerJoin(telegramUsers, eq(telegramUsers.id, telegramLinks.telegramId))
    .where(eq(telegramLinks.userId, userId))
    .limit(1);
  return link?.telegramId ?? null;
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

export default async function telegramRoutes(app: FastifyInstance) {
  /* ---------------- public group ---------------- */

  /** Mini App entry point — tells the frontend which mode it runs in. */
  app.get("/api/telegram/entry", async (req) => {
    const query = z.object({ botUsername: z.string().trim().max(64).optional() }).parse(req.query ?? {});
    return {
      mode: "miniapp",
      botUsername: query.botUsername ?? null,
      needsAccount: true,
    };
  });

  /**
   * Mini App sign-in: verify initData (via the bot service), then create the
   * web account and the session cookie in one step.
   */
  app.post(
    "/api/telegram/miniapp/auth",
    { config: { rateLimit: { max: 20, timeWindow: "10 minutes" } } },
    async (req, reply) => {
      const body = parse(initDataBody, req.body);
      const verified = await verifyInitData(body.initData);
      if (!verified) throw badRequest("Phiên Telegram đã hết hạn, hãy mở lại từ bot.");
      if (!isInitDataFresh(verified.authDate)) {
        throw badRequest(`Phiên Telegram đã hết hạn (tối đa ${INIT_DATA_MAX_AGE_SEC / 3600} giờ), hãy mở lại từ bot.`);
      }

      const { user, created } = await ensureWebAccountForTelegram(
        verified.telegramId,
        { username: verified.username, firstName: verified.firstName },
        "miniapp",
      );

      await createSession(req, reply, user.id);
      return { user: profileUser(user), linked: true, created, linkRequired: false };
    },
  );

  /**
   * Sign-up from a normal browser.
   *
   * The account is created right away, but the Telegram link is still missing,
   * so the answer carries a one-time link code and the deep link that opens
   * the bot.
   */
  app.post(
    "/api/telegram/browser/register",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const body = parse(browserRegisterBody, req.body);
      const lower = body.username.toLowerCase();
      const exists = await db.select({ id: users.id }).from(users).where(eq(users.usernameLower, lower)).limit(1);
      if (exists.length) throw badRequest("Tên đăng nhập đã có người dùng.");
      const [user] = await db
        .insert(users)
        .values({
          username: body.username,
          usernameLower: lower,
          passwordHash: await hashPassword(body.password),
          displayName: body.displayName?.slice(0, 80) || null,
          source: "web",
        })
        .returning();
      await createSession(req, reply, user.id);

      // The link code is a bonus: when no bot is available the account still
      // exists and the person can link later.
      const bot = await randomLiveBot();
      if (!bot) {
        return { user: profileUser(user), linked: false, linkRequired: true, linkUrl: null, code: null };
      }
      const { code, expiresAt } = await createLinkCode(user.id, bot.id);
      const deepLink = `https://t.me/${bot.username ?? ""}?start=${code}`;
      return {
        user: profileUser(user),
        linked: false,
        linkRequired: true,
        linkUrl: deepLink,
        code,
        botUsername: bot.username,
        expiresAt,
      };
    },
  );

  /** Public opt-out from the "Từ chối nhận" button in a Telegram message. */
  app.post(
    "/api/telegram/optout-public",
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } },
    async (req) => {
      const body = parse(optoutPublicBody, req.body);
      await setOptOut(body.tid, true);
      return { ok: true };
    },
  );

  /** Record a web visit that came from Telegram. */
  app.post(
    "/api/telegram/track",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req) => {
      const body = parse(trackBody, req.body);
      // Prefer the signed-in account; a raw telegram id from the client is
      // only trusted when it matches the account.
      let telegramId = body.telegramId ?? null;
      if (req.user) {
        telegramId = await telegramIdOfUser(req.user.id);
      }
      await db.insert(telegramVisits).values({
        telegramId,
        userId: req.user?.id ?? null,
        campaignId: body.campaignId ?? null,
        articleId: body.articleId ?? null,
        ref: body.ref ?? null,
        src: body.src ?? null,
        path: body.path ?? null,
      });
      if (telegramId) {
        await db
          .update(telegramLinks)
          .set({ lastSeenAt: new Date() })
          .where(
            eq(
              telegramLinks.telegramId,
              sql`(select id from telegram_users where telegram_id = ${telegramId})`,
            ),
          );
      }
      return { ok: true };
    },
  );

  /** A fresh one-time link code for the signed-in account. */
  app.get("/api/telegram/link-code", async (req) => {
    const user = requireUser(req);
    const bot = await randomLiveBot();
    if (!bot) throw badRequest("Hiện chưa có bot nào hoạt động, vui lòng thử lại sau.");
    const { code, expiresAt } = await createLinkCode(user.id, bot.id);
    const deepLink = `https://t.me/${bot.username ?? ""}?start=${code}`;
    return { code, botUsername: bot.username, deepLink, expiresAt };
  });

  /* ---------------- bot group (X-Bot-Secret) ---------------- */

  const requireBotSecret = async (req: FastifyRequest) => {
    const header = req.headers["x-bot-secret"];
    const value = Array.isArray(header) ? header[0] : header;
    if (!isValidBotSecret(value)) throw new HttpError(401, "Unauthorized.");
  };

  app.post("/api/bot/register", { preHandler: requireBotSecret }, async (req) => {
    const body = parse(botRegisterBody, req.body);
    await db
      .insert(telegramBots)
      .values({
        id: body.botId,
        username: body.username ?? null,
        displayName: body.displayName ?? null,
        status: "unknown",
      })
      .onConflictDoUpdate({
        target: telegramBots.id,
        set: {
          username: body.username ?? null,
          displayName: body.displayName ?? null,
          lastCheckedAt: new Date(),
          // The bot service only registers a bot after Telegram answered, so
          // the bot is alive. A bot that was marked as banned by mistake —
          // a 403 because one user blocked it — goes back into the fleet
          // here (B115).
          status: "live",
          lastError: null,
          bannedAt: null,
          lastBanReason: null,
        },
      });
    return { ok: true };
  });

  app.post("/api/bot/heartbeat", { preHandler: requireBotSecret }, async (req) => {
    const body = parse(botHeartbeatBody, req.body);
    await db
      .update(telegramBots)
      .set({
        status: body.status,
        lastCheckedAt: new Date(),
        lastError: body.error ?? null,
      })
      .where(eq(telegramBots.id, body.botId));
    if (body.users?.length) {
      for (const telegramId of body.users) {
        await ensureTelegramUser(telegramId);
      }
    }
    return { ok: true };
  });

  /**
   * Hand out due jobs to the bot. Jobs are marked "sending" right away so a
   * second poll does not hand out the same job twice.
   */
  app.get(
    "/api/bot/jobs",
    {
      preHandler: requireBotSecret,
      // The bot polls the queue in a tight loop while there is a lot of work,
      // so it needs a bigger limit than the global one (B104).
      config: { rateLimit: { max: 1200, timeWindow: "1 minute" } },
    },
    async (req) => {
      const query = z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) }).parse(req.query ?? {});
      const due = await db
        .select()
        .from(notificationJobs)
        .where(and(eq(notificationJobs.status, "queued"), lte(notificationJobs.scheduledAt, new Date())))
        .orderBy(notificationJobs.scheduledAt)
        .limit(query.limit);
      const jobs: unknown[] = [];
      for (const job of due) {
        const [claimed] = await db
          .update(notificationJobs)
          .set({ status: "sending", attempts: job.attempts + 1 })
          .where(and(eq(notificationJobs.id, job.id), eq(notificationJobs.status, "queued")))
          .returning();
        if (!claimed) continue;
        jobs.push({
          jobId: claimed.id,
          campaignId: claimed.campaignId,
          telegramId: claimed.telegramId,
          botId: claimed.botId,
          // The bots this person actually pressed /start on. A bot may only
          // write to a user who started that very bot, so the service needs
          // the whole list to be able to try the next one (B115).
          candidateBotIds: await candidateBotsFor(claimed.telegramId),
          payload: claimed.payload,
        });
      }
      return { jobs };
    },
  );

  /** The bot reports the outcome of a job. */
  app.post(
    "/api/bot/result",
    {
      preHandler: requireBotSecret,
      // Every finished job is reported here, so a big campaign produces a lot
      // of calls (B104).
      config: { rateLimit: { max: 1200, timeWindow: "1 minute" } },
    },
    async (req) => {
    const body = parse(botResultBody, req.body);
    // A job that does not exist is a mistake of the bot, so the caller is
    // told about it. The batch route skips such a job instead.
    const [job] = await db
      .select({ id: notificationJobs.id })
      .from(notificationJobs)
      .where(eq(notificationJobs.id, body.jobId))
      .limit(1);
    if (!job) throw notFound("Không tìm thấy công việc.");
    await applyBotResult(body.jobId, body.status, body.error ?? null, body.botId ?? null);
    return { ok: true };
    },
  );

  /**
   * The bot reports many outcomes at once.
   *
   * A campaign of 61.000 ids produces 61.000 calls when every result is
   * reported on its own, and the round trip is what slows the whole send
   * down (B112). One request with a list of results is much faster.
   */
  app.post(
    "/api/bot/results",
    {
      preHandler: requireBotSecret,
      config: { rateLimit: { max: 1200, timeWindow: "1 minute" } },
    },
    async (req) => {
      const body = parse(
        z.object({
          results: z
            .array(
              z.object({
                jobId: z.number().int(),
                status: z.enum(["sent", "failed", "blocked", "skipped"]),
                error: z.string().max(500).nullish(),
                botId: z.string().max(64).nullish(),
              }),
            )
            .min(1)
            .max(500),
        }),
        req.body ?? {},
      );
      let done = 0;
      for (const item of body.results) {
        try {
          const ok = await applyBotResult(item.jobId, item.status, item.error ?? null, item.botId ?? null);
          if (ok) done += 1;
        } catch {
          // One bad result must not lose the others.
        }
      }
      return { ok: true, done };
    },
  );

  /** The person pressed /start (optionally with a link code). */
  app.post("/api/bot/start", { preHandler: requireBotSecret }, async (req) => {
    const body = parse(botStartBody, req.body);
    await recordBotStart(body.telegramId, body.botId);

    if (body.code) {
      const consumed = await consumeLinkCode(body.code);
      if (consumed) {
        const tgUser = await ensureTelegramUser(body.telegramId, {
          username: body.username ?? null,
          firstName: body.firstName ?? null,
        });
        await db
          .insert(telegramLinks)
          .values({ telegramId: tgUser.id, userId: consumed.user.id, method: "code", lastSeenAt: new Date() })
          .onConflictDoUpdate({
            target: telegramLinks.telegramId,
            set: { userId: consumed.user.id, method: "code", lastSeenAt: new Date() },
          });
        await db.update(users).set({ telegramId: body.telegramId, source: "telegram" }).where(eq(users.id, consumed.user.id));
        return { linked: true, username: consumed.user.username };
      }
    }

    const tgUser = await ensureTelegramUser(body.telegramId, {
      username: body.username ?? null,
      firstName: body.firstName ?? null,
    });
    const [link] = await db.select().from(telegramLinks).where(eq(telegramLinks.telegramId, tgUser.id)).limit(1);
    return { linked: !!link?.userId, username: null };
  });

  /** The person completed the link flow with a code. */
  app.post("/api/bot/link", { preHandler: requireBotSecret }, async (req) => {
    const body = parse(botLinkBody, req.body);
    const consumed = await consumeLinkCode(body.code);
    if (!consumed) throw badRequest("Mã liên kết không hợp lệ hoặc đã hết hạn.");
    const tgUser = await ensureTelegramUser(body.telegramId, {
      username: body.username ?? null,
      firstName: body.firstName ?? null,
    });
    await db.insert(telegramUserLinks).values({ telegramId: tgUser.id, botId: body.botId }).onConflictDoNothing();
    await db
      .insert(telegramLinks)
      .values({ telegramId: tgUser.id, userId: consumed.user.id, method: "code", lastSeenAt: new Date() })
      .onConflictDoUpdate({
        target: telegramLinks.telegramId,
        set: { userId: consumed.user.id, method: "code", lastSeenAt: new Date() },
      });
    await db.update(users).set({ telegramId: body.telegramId, source: "telegram" }).where(eq(users.id, consumed.user.id));
    return { linked: true, username: consumed.user.username };
  });

  /** The person pressed /stop. */
  app.post("/api/bot/optout", { preHandler: requireBotSecret }, async (req) => {
    const body = z.object({ telegramId: z.number().int().positive(), botId: z.string().trim().max(64) }).parse(req.body);
    await setOptOut(body.telegramId, true);
    return { ok: true };
  });

  /** Live bots, so the bot service can pick one by itself. */
  app.get("/api/bot/bots", { preHandler: requireBotSecret }, async () => {
    const bots = await liveBots();
    return { bots: bots.map((b) => ({ id: b.id, username: b.username, weight: b.weight })) };
  });

  /** State of a single Telegram person. */
  app.get("/api/bot/user/:telegramId", { preHandler: requireBotSecret }, async (req) => {
    const { telegramId } = z.object({ telegramId: z.coerce.number().int().positive() }).parse(req.params);
    const tgUser = await ensureTelegramUser(telegramId);
    const [link] = await db.select().from(telegramLinks).where(eq(telegramLinks.telegramId, tgUser.id)).limit(1);
    return {
      telegramId,
      status: tgUser.status,
      optOut: tgUser.optOut,
      notifyEnabled: tgUser.notifyEnabled,
      linked: !!link?.userId,
      userId: link?.userId ?? null,
    };
  });

  /** Summary numbers for the bot dashboard. */
  app.get("/api/bot/stats", { preHandler: requireBotSecret }, async () => {
    const [[tg], [bots], [jobs], [sent]] = await Promise.all([
      db.select({ n: count() }).from(telegramUsers),
      db.select({ n: count() }).from(telegramBots),
      db.select({ n: count() }).from(notificationJobs),
      db.select({ n: count() }).from(deliveryLog).where(eq(deliveryLog.status, "sent")),
    ]);
    return { telegramUsers: tg.n, bots: bots.n, jobs: jobs.n, sent: sent.n };
  });

  /* ---------------- admin group ---------------- */

  app.get("/api/admin/telegram/overview", async (req) => {
    requireAdmin(req);
    const [[tg], [linked], [optout], [blocked], [sent], [visits], [clicks]] = await Promise.all([
      db.select({ n: count() }).from(telegramUsers),
      db.select({ n: count() }).from(telegramLinks).where(isNotNull(telegramLinks.userId)),
      db.select({ n: count() }).from(telegramUsers).where(eq(telegramUsers.optOut, true)),
      db.select({ n: count() }).from(telegramUsers).where(eq(telegramUsers.status, "blocked")),
      db.select({ n: count() }).from(deliveryLog).where(eq(deliveryLog.status, "sent")),
      db.select({ n: count() }).from(telegramVisits),
      db.select({ n: count() }).from(telegramVisits).where(isNotNull(telegramVisits.campaignId)),
    ]);
    const ctr = sent.n > 0 ? Math.round((clicks.n / sent.n) * 100) : 0;
    return {
      telegramUsers: tg.n,
      linked: linked.n,
      optOut: optout.n,
      blocked: blocked.n,
      sent: sent.n,
      visits: visits.n,
      clicks: clicks.n,
      ctr,
    };
  });

  app.get("/api/admin/telegram/users", async (req) => {
    requireAdmin(req);
    const query = z
      .object({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        q: z.string().trim().max(64).optional(),
        status: z.enum(["unknown", "active", "blocked", "invalid"]).optional(),
      })
      .parse(req.query ?? {});
    const where = query.status ? eq(telegramUsers.status, query.status) : undefined;
    const rows = await db
      .select({
        telegramId: telegramUsers.telegramId,
        username: telegramUsers.username,
        firstName: telegramUsers.firstName,
        status: telegramUsers.status,
        optOut: telegramUsers.optOut,
        notifyEnabled: telegramUsers.notifyEnabled,
        linkedUserId: telegramLinks.userId,
        linkedUsername: users.username,
        lastSeenAt: telegramLinks.lastSeenAt,
        createdAt: telegramUsers.createdAt,
      })
      .from(telegramUsers)
      .leftJoin(telegramLinks, eq(telegramLinks.telegramId, telegramUsers.id))
      .leftJoin(users, eq(users.id, telegramLinks.userId))
      .where(where)
      .orderBy(desc(telegramUsers.id))
      .limit(50)
      .offset((query.page - 1) * 50);
    const q = query.q?.toLowerCase();
    const filtered = q
      ? rows.filter((r) =>
          `${r.username ?? ""} ${r.firstName ?? ""} ${r.linkedUsername ?? ""} ${r.telegramId}`.toLowerCase().includes(q),
        )
      : rows;
    return { rows: filtered, page: query.page };
  });

  app.patch("/api/admin/telegram/users/:telegramId", async (req) => {
    requireAdmin(req);
    const { telegramId } = z.object({ telegramId: z.coerce.number().int().positive() }).parse(req.params);
    const body = parse(
      z.object({
        status: z.enum(["unknown", "active", "blocked", "invalid"]).optional(),
        optOut: z.boolean().optional(),
        notifyEnabled: z.boolean().optional(),
      }),
      req.body,
    );
    const patch: { status?: string; optOut?: boolean; notifyEnabled?: boolean; optedOutAt?: Date | null; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (body.status !== undefined) patch.status = body.status;
    if (body.optOut !== undefined) {
      patch.optOut = body.optOut;
      patch.optedOutAt = body.optOut ? new Date() : null;
    }
    if (body.notifyEnabled !== undefined) patch.notifyEnabled = body.notifyEnabled;
    await db.update(telegramUsers).set(patch).where(eq(telegramUsers.telegramId, telegramId));
    return { ok: true };
  });

  app.get("/api/admin/telegram/campaigns", async (req) => {
    requireAdmin(req);
    const rows = await db.select().from(telegramCampaigns).orderBy(desc(telegramCampaigns.createdAt)).limit(100);
    return { rows };
  });

  app.get("/api/admin/telegram/campaigns/:id", async (req) => {
    requireAdmin(req);
    const { id } = z.object({ id: z.string().trim().max(64) }).parse(req.params);
    const [campaign] = await db.select().from(telegramCampaigns).where(eq(telegramCampaigns.id, id)).limit(1);
    if (!campaign) throw notFound("Không tìm thấy chiến dịch.");
    const [delivered] = await db.select({ n: count() }).from(deliveryLog).where(eq(deliveryLog.campaignId, id));
    const [clicks] = await db
      .select({ n: count() })
      .from(telegramVisits)
      .where(eq(telegramVisits.campaignId, id));
    return { campaign, delivered: delivered.n, clicks: clicks.n };
  });

  app.post("/api/admin/telegram/campaigns", async (req) => {
    const admin = requireAdmin(req);
    const body = parse(campaignBody, req.body);
    const id = randomUUID();
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : body.schedule === "now" ? new Date() : null;
    const [created] = await db
      .insert(telegramCampaigns)
      .values({
        id,
        name: body.name,
        text: body.text,
        mediaType: body.mediaType,
        mediaKey: body.mediaKey ?? null,
        mediaSource: body.mediaSource ?? null,
        mediaNote: body.mediaNote ?? null,
        buttons: body.buttons,
        articleIds: body.articleIds,
        targetType: body.targetType,
        targetIds: body.targetIds,
        isEmergency: body.isEmergency,
        schedule: body.schedule,
        // A schedule never runs until the admin activates it (rule Q9).
        scheduleStatus: "paused",
        scheduledAt,
        hour: body.hour,
        minute: body.minute,
        dayOfWeek: body.dayOfWeek ?? null,
        createdBy: admin.id,
      })
      .returning();
    return { campaign: created };
  });

  /**
   * Upload a media file for a campaign.
   *
   * The file is described the same way the campaigns and the greetings describe
   * their media, so the bot can send it as it is.
   */
  app.post(
    "/api/admin/telegram/campaigns/media",
    { config: { rateLimit: { max: 30, timeWindow: "10 minutes" } } },
    async (req) => {
      requireAdmin(req);
      const parts = req.parts({ limits: { fileSize: config.maxVideoMb * MB, files: 1, fields: 4 } });
      for await (const part of parts) {
        if (part.type === "field") continue;
        const filename = part.filename ?? "";
        const isVideo = /\.(mp4|webm|mov)$/i.test(filename);

        if (isVideo) {
          const ext = videoExtFromName(filename);
          if (!ext) {
            part.file.resume();
            throw badRequest("Chỉ nhận video định dạng mp4, webm hoặc mov.");
          }
          const dir = VIDEO_DIR();
          await mkdir(dir, { recursive: true });
          const key = randomBytes(16).toString("hex");
          const tmp = path.join(dir, `${key}.${ext}.part`);
          try {
            await pipeline(part.file, createWriteStream(tmp));
          } catch (err) {
            await rm(tmp, { force: true });
            if ((err as { statusCode?: number }).statusCode === 413) {
              throw new HttpError(413, `Video quá lớn (tối đa ${config.maxVideoMb} MB).`);
            }
            throw err;
          }
          if (part.file.truncated) {
            await rm(tmp, { force: true });
            throw new HttpError(413, `Video quá lớn (tối đa ${config.maxVideoMb} MB).`);
          }
          const head = Buffer.alloc(16);
          const fh = await open(tmp, "r");
          try {
            await fh.read(head, 0, 16, 0);
          } finally {
            await fh.close();
          }
          if (!looksLikeVideo(head, ext)) {
            await rm(tmp, { force: true });
            throw badRequest("File không phải video hợp lệ.");
          }
          const sizeBytes = (await stat(tmp)).size;
          await rename(tmp, path.join(dir, `${key}.${ext}`));
          return {
            type: "video",
            key: `video:${key}.${ext}`,
            source: "upload",
            url: `/media/v/${key}.${ext}`,
            sizeBytes,
          };
        }

        // An image.
        const buffer = await part.toBuffer();
        if (!buffer.length) throw badRequest("Chưa chọn ảnh.");
        const stored = await storeImage("ads", buffer);
        return {
          type: "image",
          key: `image:${stored.key}`,
          source: "upload",
          url: `/media/b/${stored.key}.webp`,
          width: stored.width,
          height: stored.height,
        };
      }
      throw badRequest("Chưa chọn file.");
    },
  );

  /**
   * The imported ids grouped by their status.
   *
   * This is the list the admin picks from: the first emergency scan goes to
   * everybody, the later ones only to the ids that turned out to be alive.
   */
  app.get(
    "/api/admin/telegram/ids/groups",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
      requireAdmin(req);
      const rows = await db
        .select({ status: telegramUsers.status, n: count() })
        .from(telegramUsers)
        .groupBy(telegramUsers.status);
      const groups: { status: string; count: number; label: string }[] = [];
      const labels: Record<string, string> = {
        active: "Hoạt động (bot đã bắt được)",
        blocked: "Đã bị chặn (Telegram chặn bot)",
        invalid: "Không hợp lệ (id sai / không tồn tại)",
        unknown: "Chưa gửi lần nào",
      };
      for (const row of rows) {
        const status = row.status ?? "unknown";
        groups.push({ status, count: row.n, label: labels[status] ?? status });
      }
      const total = groups.reduce((sum, g) => sum + g.count, 0);
      return { groups, total };
    },
  );

  /**
   * Put the finished jobs back into the queue.
   *
   * The admin wants the campaign to reach every id, so a job that failed or
   * was skipped is put back into the queue instead of being thrown away.
   * The ids keep their status — the report still says which ids are alive.
   */
  app.post(
    "/api/admin/telegram/ids/requeue",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req) => {
      requireAdmin(req);
      const body = parse(
        z.object({
          campaignId: z.string().trim().max(64).nullish(),
          // Only the ids that never got the message. When it is false the
          // whole list is sent again, including the ids that got it.
          onlyUndelivered: z.boolean().optional(),
        }),
        req.body ?? {},
      );
      const statuses = body.onlyUndelivered
        ? ["failed", "skipped"]
        : ["failed", "skipped", "sent", "blocked", "cancelled"];
      // The finished jobs are removed first. A second job for the same id
      // would send the message twice, and the queue only knows the first one.
      const removed = await db
        .delete(notificationJobs)
        .where(
          and(
            inArray(notificationJobs.status, statuses),
            body.campaignId
              ? eq(notificationJobs.campaignId, body.campaignId)
              : undefined,
          ),
        )
        .returning({
          id: notificationJobs.id,
          telegramId: notificationJobs.telegramId,
          campaignId: notificationJobs.campaignId,
          payload: notificationJobs.payload,
          botId: notificationJobs.botId,
        });

      // One new job for every id, with the same message as before, so the
      // whole list is sent again from scratch.
      const jobs = removed.map((r) => ({
        campaignId: r.campaignId,
        telegramId: r.telegramId,
        botId: r.botId,
        payload: r.payload,
        status: "queued",
        scheduledAt: new Date(),
      }));
      let requeued = 0;
      for (let i = 0; i < jobs.length; i += 500) {
        await db.insert(notificationJobs).values(jobs.slice(i, i + 500));
        requeued += Math.min(500, jobs.length - i);
      }
      return { requeued };
    },
  );

  app.patch("/api/admin/telegram/campaigns/:id", async (req) => {
    requireAdmin(req);
    const { id } = z.object({ id: z.string().trim().max(64) }).parse(req.params);
    const body = parse(campaignPatchBody, req.body);
    const [existing] = await db.select().from(telegramCampaigns).where(eq(telegramCampaigns.id, id)).limit(1);
    if (!existing) throw notFound("Không tìm thấy chiến dịch.");
    await db
      .update(telegramCampaigns)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(telegramCampaigns.id, id));
    const [updated] = await db.select().from(telegramCampaigns).where(eq(telegramCampaigns.id, id)).limit(1);
    return { campaign: updated };
  });

  app.post("/api/admin/telegram/campaigns/:id/send", async (req) => {
    requireAdmin(req);
    const { id } = z.object({ id: z.string().trim().max(64) }).parse(req.params);
    const [campaign] = await db.select().from(telegramCampaigns).where(eq(telegramCampaigns.id, id)).limit(1);
    if (!campaign) throw notFound("Không tìm thấy chiến dịch.");

    // Sending only happens inside the allowed window (08:00–22:00 Vietnam).
    // An emergency campaign goes out right away.
    const scheduledAt = campaign.isEmergency ? new Date() : nextAllowedTime();
    const result = await queueCampaign(id, scheduledAt);
    if (result.queued > 0) {
      // The campaign is marked as "done" for the scheduler. When it stayed
      // "active", the scheduler queued the whole campaign again every
      // minute and the list of jobs grew without end (B114).
      await db
        .update(telegramCampaigns)
        .set({ status: "queued", scheduleStatus: "done", updatedAt: new Date() })
        .where(eq(telegramCampaigns.id, id));
    }
    return { queued: result.queued, skipped: result.skipped, reasons: result.skippedReasons, scheduledAt };
  });

  app.post("/api/admin/telegram/campaigns/:id/activate", async (req) => {
    requireAdmin(req);
    const { id } = z.object({ id: z.string().trim().max(64) }).parse(req.params);
    const [updated] = await db
      .update(telegramCampaigns)
      .set({ scheduleStatus: "active", status: "queued", updatedAt: new Date() })
      .where(eq(telegramCampaigns.id, id))
      .returning();
    if (!updated) throw notFound("Không tìm thấy chiến dịch.");
    return { campaign: updated };
  });

  app.post("/api/admin/telegram/campaigns/:id/pause", async (req) => {
    requireAdmin(req);
    const { id } = z.object({ id: z.string().trim().max(64) }).parse(req.params);
    const [updated] = await db
      .update(telegramCampaigns)
      .set({ scheduleStatus: "paused", status: "paused", updatedAt: new Date() })
      .where(eq(telegramCampaigns.id, id))
      .returning();
    if (!updated) throw notFound("Không tìm thấy chiến dịch.");
    return { campaign: updated };
  });

  app.post("/api/admin/telegram/campaigns/:id/cancel", async (req) => {
    requireAdmin(req);
    const { id } = z.object({ id: z.string().trim().max(64) }).parse(req.params);
    // The jobs that are already being sent cannot be stopped, but they must
    // not be picked up again either (B116).
    await db
      .update(notificationJobs)
      .set({ status: "cancelled", error: "Chiến dịch đã bị huỷ." })
      .where(and(eq(notificationJobs.campaignId, id), eq(notificationJobs.status, "queued")));
    await db
      .update(notificationJobs)
      .set({ status: "cancelled", error: "Chiến dịch đã bị huỷ." })
      .where(and(eq(notificationJobs.campaignId, id), eq(notificationJobs.status, "sending")));
    const [updated] = await db
      .update(telegramCampaigns)
      .set({ status: "cancelled", scheduleStatus: "paused", updatedAt: new Date() })
      .where(eq(telegramCampaigns.id, id))
      .returning();
    if (!updated) throw notFound("Không tìm thấy chiến dịch.");
    return { campaign: updated };
  });

  /**
   * Delete a campaign.
   *
   * A campaign that is still running is cancelled first, so no message goes
   * out after the admin pressed the button (B116).
   */
  app.delete("/api/admin/telegram/campaigns/:id", async (req) => {
    requireAdmin(req);
    const { id } = z.object({ id: z.string().trim().max(64) }).parse(req.params);
    const [campaign] = await db.select().from(telegramCampaigns).where(eq(telegramCampaigns.id, id)).limit(1);
    if (!campaign) throw notFound("Không tìm thấy chiến dịch.");

    // The jobs of the campaign go away as well — a deleted campaign must not
    // keep any message in the queue.
    await db
      .update(notificationJobs)
      .set({ status: "cancelled", error: "Chiến dịch đã bị xoá." })
      .where(and(eq(notificationJobs.campaignId, id), inArray(notificationJobs.status, ["queued", "sending"])));
    await db.delete(notificationJobs).where(eq(notificationJobs.campaignId, id));
    await db.delete(telegramCampaigns).where(eq(telegramCampaigns.id, id));
    return { deleted: id };
  });

  /**
   * The live progress of a campaign.
   *
   * The numbers come straight from the job table, so the admin sees the
   * campaign moving while it runs (B117).
   */
  app.get("/api/admin/telegram/campaigns/:id/progress", async (req) => {
    requireAdmin(req);
    const { id } = z.object({ id: z.string().trim().max(64) }).parse(req.params);
    const [campaign] = await db.select().from(telegramCampaigns).where(eq(telegramCampaigns.id, id)).limit(1);
    if (!campaign) throw notFound("Không tìm thấy chiến dịch.");

    const rows = await db
      .select({ status: notificationJobs.status, n: count() })
      .from(notificationJobs)
      .where(eq(notificationJobs.campaignId, id))
      .groupBy(notificationJobs.status);
    const jobs: Record<string, number> = {
      queued: 0,
      sending: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      cancelled: 0,
    };
    for (const row of rows) jobs[row.status] = row.n;

    const total = Object.values(jobs).reduce((sum, n) => sum + n, 0);
    const done = jobs.sent + jobs.failed + jobs.skipped + jobs.cancelled;
    // The delivery log holds the errors, so the admin sees why a send
    // failed.
    const errors = await db
      .select({ error: notificationJobs.error, n: count() })
      .from(notificationJobs)
      .where(and(eq(notificationJobs.campaignId, id), eq(notificationJobs.status, "failed")))
      .groupBy(notificationJobs.error)
      .orderBy(desc(count()))
      .limit(6);
    return {
      campaignId: id,
      status: campaign.status,
      scheduleStatus: campaign.scheduleStatus,
      total,
      ...jobs,
      done,
      pending: total - done,
      percent: total ? Math.round((done / total) * 100) : 0,
      errors: errors.map((e) => ({ error: e.error, n: e.n })),
    };
  });

  /** Recent articles so the admin can pick content quickly. */
  app.get("/api/admin/telegram/articles/recent", async (req) => {
    requireAdmin(req);
    const query = z.object({ hours: z.coerce.number().int().min(1).max(720).default(24) }).parse(req.query ?? {});
    const since = new Date(Date.now() - query.hours * 3600_000);
    const rows = await db
      .select({
        id: articles.id,
        title: articles.title,
        visibility: articles.visibility,
        coverType: articles.coverType,
        coverImageKey: articles.coverImageKey,
        createdAt: articles.createdAt,
      })
      .from(articles)
      .where(gte(articles.createdAt, since))
      .orderBy(desc(articles.createdAt))
      .limit(50);

    // Media files of every article, so the admin can pick a real file to send.
    const ids = rows.map((r) => r.id);
    const images = ids.length
      ? await db
          .select({ articleId: articleImages.articleId, fileKey: articleImages.fileKey })
          .from(articleImages)
          .where(inArray(articleImages.articleId, ids))
      : [];
    const videos = ids.length
      ? await db
          .select({ articleId: articleVideos.articleId, fileKey: articleVideos.fileKey, ext: articleVideos.ext })
          .from(articleVideos)
          .where(inArray(articleVideos.articleId, ids))
      : [];

    const mediaByArticle = new Map<
      number,
      { kind: "image" | "video"; key: string; ext?: string }[]
    >();
    for (const img of images) {
      const list = mediaByArticle.get(img.articleId) ?? [];
      list.push({ kind: "image", key: img.fileKey });
      mediaByArticle.set(img.articleId, list);
    }
    for (const vid of videos) {
      const list = mediaByArticle.get(vid.articleId) ?? [];
      list.push({ kind: "video", key: vid.fileKey, ext: vid.ext });
      mediaByArticle.set(vid.articleId, list);
    }

    return {
      rows: rows.map((r) => ({
        ...r,
        media: mediaByArticle.get(r.id) ?? [],
      })),
    };
  });

  /** Import a list of Telegram ids (one per line, or a CSV column). */
  app.post("/api/admin/telegram/import-ids", async (req) => {
    requireAdmin(req);
    const body = parse(z.object({ content: z.string().min(1).max(2_000_000) }), req.body);
    const ids = new Set<number>();
    for (const line of body.content.split(/[\r\n,;]+/)) {
      const cleaned = line.trim().replace(/^\D+/, "");
      if (!cleaned) continue;
      const value = Number(cleaned);
      if (Number.isSafeInteger(value) && value > 0) ids.add(value);
    }
    const list = [...ids];
    for (const telegramId of list) {
      await ensureTelegramUser(telegramId);
    }
    return { imported: list.length, ids: list.slice(0, 1000) };
  });

  /** The Telegram people known to the site, so the admin can pick ids again. */
  app.get("/api/admin/telegram/imported-ids", async (req) => {
    requireAdmin(req);
    const rows = await db
      .select({
        telegramId: telegramUsers.telegramId,
        username: telegramUsers.username,
        firstName: telegramUsers.firstName,
        status: telegramUsers.status,
        linkedUserId: telegramLinks.userId,
      })
      .from(telegramUsers)
      .leftJoin(telegramLinks, eq(telegramLinks.telegramId, telegramUsers.id))
      .orderBy(desc(telegramUsers.updatedAt))
      .limit(500);
    return { rows };
  });

  app.get("/api/admin/telegram/bots", async (req) => {
    requireAdmin(req);
    const rows = await db.select().from(telegramBots).orderBy(desc(telegramBots.sortOrder), telegramBots.id);
    return { rows };
  });

  app.patch("/api/admin/telegram/bots/:id", async (req) => {
    requireAdmin(req);
    const { id } = z.object({ id: z.string().trim().max(64) }).parse(req.params);
    const body = parse(
      z.object({
        weight: z.number().int().min(1).max(100).optional(),
        autoResponder: z.boolean().optional(),
        status: z.enum(["live", "ban", "error", "unknown"]).optional(),
        sortOrder: z.number().int().min(0).max(10000).optional(),
      }),
      req.body,
    );
    const [updated] = await db.update(telegramBots).set(body).where(eq(telegramBots.id, id)).returning();
    if (!updated) throw notFound("Không tìm thấy bot.");
    return { bot: updated };
  });

  /** Force a health check of a bot right away. */
  app.post("/api/admin/telegram/bots/:id/check", async (req) => {
    requireAdmin(req);
    const { id } = z.object({ id: z.string().trim().max(64) }).parse(req.params);
    const [bot] = await db.select().from(telegramBots).where(eq(telegramBots.id, id)).limit(1);
    if (!bot) throw notFound("Không tìm thấy bot.");

    // The bot service performs the actual getMe call; the web only records
    // the result. When the service cannot be reached the bot is marked as
    // unknown so the admin sees that a check is still pending.
    const result = await requestBotCheck(id);
    const status = result?.status ?? "unknown";
    const error = result?.error ?? (result ? null : "Không gọi được dịch vụ bot.");
    const [updated] = await db
      .update(telegramBots)
      .set({ status, lastCheckedAt: new Date(), lastError: error })
      .where(eq(telegramBots.id, id))
      .returning();
    return { bot: updated, checked: Boolean(result) };
  });
}

/**
 * Ask the bot service to run getMe for one bot.
 *
 * Returns null when the service cannot be reached.
 */
async function requestBotCheck(
  botId: string,
): Promise<{ status: string; error?: string | null } | null> {
  try {
    const res = await fetch(`${config.botInternalUrl}/internal/check-bot`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bot-secret": config.botApiSecret },
      body: JSON.stringify({ botId }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; status?: string; error?: string | null };
    if (!data.ok || !data.status) return null;
    return { status: data.status, error: data.error ?? null };
  } catch {
    return null;
  }
}
