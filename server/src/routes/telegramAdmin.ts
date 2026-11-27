import { randomUUID, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { and, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth.js";
import { db } from "../db/index.js";
import { isValidBotSecret } from "../telegram.js";
import {
  articleImages,
  articles,
  articleVideos,
  deliveryLog,
  notificationJobs,
  telegramBotIncidents,
  telegramBots,
  telegramCampaigns,
  telegramSettings,
  telegramUsers,
  telegramUserLinks,
} from "../db/schema.js";
import { badRequest, HttpError, notFound, parse } from "../http.js";
import { config } from "../config.js";
import { decryptToken, encryptToken, maskToken, tokenStorageEnabled } from "../crypto.js";
import { looksLikeVideo, storeImage, VIDEO_DIR, videoExtFromName } from "../media.js";
/**
 * Management endpoints of the Telegram side that the old Python dashboard had:
 * bots, the reply keyboard, the message templates, the imported id list and
 * the bot settings.
 */

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** One megabyte in bytes. */
const MB = 1024 * 1024;

/** Read one setting of the Telegram side. */
async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(telegramSettings).where(eq(telegramSettings.key, key)).limit(1);
  return (row?.value as T | undefined) ?? fallback;
}

/** Write one setting of the Telegram side. */
async function writeSetting(key: string, value: unknown): Promise<void> {
  await db
    .insert(telegramSettings)
    .values({ key, value: value as never })
    .onConflictDoUpdate({
      target: telegramSettings.key,
      set: { value: value as never, updatedAt: new Date() },
    });
}

/** The base URL of the site, without a trailing slash. */
function siteBase(): string {
  return (config.siteUrl || "http://127.0.0.1:8090").replace(/\/+$/, "");
}

/**
 * The shape of the greeting as it is stored in the settings.
 */
interface StoredGreetingItem {
  id?: string;
  text: string;
  media?: { type?: string; key?: string | null; source?: string | null };
  buttons?: { label: string; url: string }[];
  link?: { articleId?: number | null; url?: string | null };
}

interface StoredGreeting {
  enabled?: boolean;
  keepButtons?: boolean;
  items?: StoredGreetingItem[];
}

/**
 * Turn the stored greeting into the shape the bot needs.
 *
 * The article links become real URLs, and the media is described the same way
 * the campaigns describe it, so the bot can send the file straight away.
 */
async function resolveGreeting(stored: StoredGreeting) {
  const items = stored.items ?? [];

  // The articles the greetings point at.
  const articleIds = [
    ...new Set(
      items
        .map((item) => item.link?.articleId)
        .filter((id): id is number => typeof id === "number" && id > 0),
    ),
  ];
  const articleRows = articleIds.length
    ? await db
        .select({ id: articles.id, title: articles.title, visibility: articles.visibility })
        .from(articles)
        .where(inArray(articles.id, articleIds))
    : [];
  const articleById = new Map(articleRows.map((row) => [row.id, row]));

  // The media files of the greetings, so a members-only file is never sent.
  const mediaKeys = items
    .map((item) => item.media?.key)
    .filter((key): key is string => typeof key === "string" && key.length > 0)
    .map((key) => {
      const sep = key.indexOf(":");
      return sep === -1 ? key : key.slice(sep + 1).replace(/\.[a-z0-9]+$/i, "");
    });
  const uniqueMediaKeys = [...new Set(mediaKeys)];
  const imageRows = uniqueMediaKeys.length
    ? await db
        .select({ fileKey: articleImages.fileKey, articleId: articleImages.articleId })
        .from(articleImages)
        .where(inArray(articleImages.fileKey, uniqueMediaKeys))
    : [];
  const videoRows = uniqueMediaKeys.length
    ? await db
        .select({
          fileKey: articleVideos.fileKey,
          ext: articleVideos.ext,
          articleId: articleVideos.articleId,
          sizeBytes: articleVideos.sizeBytes,
        })
        .from(articleVideos)
        .where(inArray(articleVideos.fileKey, uniqueMediaKeys))
    : [];

  const base = siteBase();

  // The visibility of every file that is sent, so a members-only file is
  // never uploaded to Telegram.
  const ownerIds = [
    ...new Set([...videoRows, ...imageRows].map((row) => row.articleId).filter((id) => id > 0)),
  ];
  const ownerVisibilityById = new Map<number, string>();
  if (ownerIds.length) {
    const owners = await db
      .select({ id: articles.id, visibility: articles.visibility })
      .from(articles)
      .where(inArray(articles.id, ownerIds));
    for (const owner of owners) ownerVisibilityById.set(owner.id, owner.visibility);
  }

  return {
    enabled: stored.enabled ?? false,
    keepButtons: stored.keepButtons ?? true,
    items: items.map((item) => {
      const article = item.link?.articleId ? articleById.get(item.link.articleId) : undefined;
      // A hand written URL wins; otherwise the article becomes a link.
      const linkUrl = item.link?.url?.trim()
        ? item.link.url.trim()
        : article
          ? `${base}/bai-viet/${article.id}`
          : null;

      let media: { kind: string; url: string; sizeBytes: number; isPublic: boolean } | null = null;
      const rawKey = item.media?.key ?? "";
      const type = item.media?.type ?? "none";
      if (type !== "none" && rawKey) {
        const sep = rawKey.indexOf(":");
        const kind = sep === -1 ? type : rawKey.slice(0, sep);
        const file = sep === -1 ? rawKey : rawKey.slice(sep + 1);
        const isVideo = kind === "video" || type === "video";
        const ext = file.includes(".") ? (file.split(".").pop() as string) : isVideo ? "mp4" : "webp";
        const key = file.replace(/\.[a-z0-9]+$/i, "");

        // The size decides whether Telegram accepts the file.
        const video = videoRows.find((row) => row.fileKey === key);
        const image = imageRows.find((row) => row.fileKey === key);
        const ownerId = video?.articleId ?? image?.articleId;
        const ownerVisibility = ownerId ? ownerVisibilityById.get(ownerId) : undefined;
        // A file the admin uploaded lives in the ads folder; a file of an
        // article lives with the images of the articles.
        const isUpload = item.media?.source === "upload";
        const folder = isVideo ? "v" : isUpload ? "b" : "a";
        media = {
          kind: isVideo ? "video" : "image",
          url: `${base}/media/${folder}/${key}.${ext}`,
          sizeBytes: video?.sizeBytes ?? 0,
          isPublic: ownerVisibility !== "members",
        };
      }

      return {
        id: item.id ?? "",
        text: item.text ?? "",
        linkUrl,
        buttons: (item.buttons ?? []).map((button) => ({ label: button.label, url: button.url })),
        media,
      };
    }),
  };
}

/**
 * Ask the bot service to register a new bot or to drop one.
 *
 * The service owns the Telegram connections, so it is the only place able to
 * start or stop a bot. The web only records the wish.
 */
async function notifyBotService(action: "add" | "remove", botId: string, token?: string): Promise<boolean> {
  try {
    const res = await fetch(`${config.botInternalUrl}/internal/bot-token`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bot-secret": config.botApiSecret },
      body: JSON.stringify({ action, botId, token }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Check a token against the Telegram API directly (getMe). */
async function verifyToken(token: string): Promise<{
  ok: boolean;
  error?: string;
  username?: string | null;
  displayName?: string | null;
  telegramId?: string;
}> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401) return { ok: false, error: "Token không hợp lệ hoặc đã bị thu hồi." };
    if (!res.ok) return { ok: false, error: `Telegram trả về HTTP ${res.status}.` };
    const data = (await res.json()) as { ok?: boolean; result?: { username?: string; first_name?: string; id?: number } };
    if (!data.ok || !data.result) return { ok: false, error: "Telegram không trả về thông tin bot." };
    return {
      ok: true,
      username: data.result.username ?? null,
      displayName: data.result.first_name ?? null,
      telegramId: data.result.id != null ? String(data.result.id) : undefined,
    };
  } catch {
    return { ok: false, error: "Không kết nối được Telegram để kiểm tra token." };
  }
}

/* ------------------------------------------------------------------ *
 * Schemas
 * ------------------------------------------------------------------ */

const botAddBody = z.object({
  name: z.string().trim().min(1, "Cần nhập tên bot.").max(80),
  token: z.string().trim().min(20, "Token quá ngắn.").max(200),
  weight: z.number().int().min(0).max(100).optional(),
  autoResponder: z.boolean().optional(),
});

/** The reply keyboard shown under the chat box of the user. */
const keyboardBody = z.object({
  enabled: z.boolean(),
  prompt: z.string().trim().max(500).default(""),
  rows: z
    .array(
      z.array(
        z.object({
          label: z.string().trim().min(1).max(64),
          type: z.enum(["text", "url", "webapp", "open_site", "remove_keyboard", "stats"]),
          body: z.string().trim().max(1000).optional(),
          url: z.string().trim().max(500).optional(),
          albumId: z.string().trim().max(64).optional(),
        }),
      ),
    )
    .max(12)
    .default([]),
});

/** A ready to use text that can be picked while writing a campaign. */
const templateBody = z.object({
  id: z.string().trim().max(64).optional(),
  title: z.string().trim().min(1, "Cần nhập tên mẫu.").max(80),
  text: z.string().trim().min(1, "Cần nhập nội dung.").max(2000),
});

const importIdsBody = z.object({
  content: z.string().min(1, "Nội dung rỗng.").max(5_000_000),
  filename: z.string().trim().max(200).optional(),
});

/**
 * The greeting the bot sends when somebody presses /start.
 *
 * The admin writes the texts on the web; the bot picks one of them at random.
 * The texts may use HTML and the placeholders {{name}} and {{link}}.
 *
 * Every greeting can carry its own media (an image or a video), its own inline
 * buttons and its own link, so the admin decides what the message leads to.
 */
const greetingButtonBody = z.object({
  label: z.string().trim().min(1, "Cần nhập nhãn nút.").max(64),
  url: z.string().trim().min(1, "Cần nhập địa chỉ nút.").max(500),
});

const greetingMediaBody = z.object({
  /** "none" | "image" | "video" */
  type: z.enum(["none", "image", "video"]),
  /** "<kind>:<fileKey>" — the same shape the campaigns use. */
  key: z.string().trim().max(64).nullish(),
  /** "article" | "upload" — where the file comes from. */
  source: z.enum(["article", "upload"]).nullish(),
});

const greetingBody = z.object({
  enabled: z.boolean(),
  /** Keep the buttons of the current /start answer. */
  keepButtons: z.boolean(),
  items: z
    .array(
      z.object({
        id: z.string().trim().max(64).optional(),
        text: z.string().trim().min(1, "Cần nhập nội dung lời chào.").max(2000),
        /** The media sent together with the text. */
        media: greetingMediaBody.optional(),
        /** The inline buttons of this greeting. */
        buttons: z.array(greetingButtonBody).max(10).default([]),
        /** A link the admin chose from the articles, or typed by hand. */
        link: z
          .object({
            /** The article the link points at. */
            articleId: z.number().int().positive().nullish(),
            /** A hand written URL. */
            url: z.string().trim().max(500).nullish(),
          })
          .optional(),
      }),
    )
    .max(50)
    .default([]),
});

/** One bot of the migration payload. */
const importBotBody = z.object({
  /** The id the old system used — kept so the links of the past stay readable. */
  oldId: z.string().trim().min(1).max(64),
  name: z.string().trim().max(80).nullish(),
  username: z.string().trim().max(64).nullish(),
  token: z.string().trim().min(20, "Token quá ngắn.").max(200),
  /** "live" | "ban" | "error" | "unknown" */
  status: z.enum(["live", "ban", "error", "unknown"]).default("unknown"),
  autoResponder: z.boolean().default(true),
  weight: z.number().int().min(0).max(100).default(1),
  startsCount: z.number().int().min(0).default(0),
  messagesSent: z.number().int().min(0).default(0),
  interactionsCount: z.number().int().min(0).default(0),
  repliesCount: z.number().int().min(0).default(0),
});

const importBotsBody = z.object({
  bots: z.array(importBotBody).max(200),
  /** Telegram ids that pressed /start on a given bot. */
  startedBy: z.record(z.string(), z.array(z.coerce.number().int().positive())).optional(),
  /** The imported id list with its status. */
  ids: z
    .array(
      z.object({
        telegramId: z.coerce.number().int().positive(),
        status: z.enum(["unknown", "active", "blocked", "invalid"]).default("unknown"),
        username: z.string().trim().max(64).nullish(),
        firstName: z.string().trim().max(80).nullish(),
        ageVerified: z.boolean().default(false),
        captchaOk: z.boolean().default(false),
        /** The bots this person pressed /start on. */
        bots: z.array(z.string().trim().max(64)).max(50).default([]),
      }),
    )
    .max(500_000)
    .optional(),
});

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

export default async function telegramAdminRoutes(app: FastifyInstance) {
  /** Only the bot service may call the internal endpoints. */
  const requireBotSecret = async (req: { headers: Record<string, unknown> }) => {
    const header = req.headers["x-bot-secret"];
    const value = Array.isArray(header) ? header[0] : header;
    if (!isValidBotSecret(typeof value === "string" ? value : undefined)) throw new HttpError(401, "Unauthorized.");
  };

  /* ---------------- bots ---------------- */

  /** List every bot with its token state (never the token itself). */
  app.get("/api/admin/telegram/bots/list", async (req) => {
    requireAdmin(req);
    const rows = await db.select().from(telegramBots).orderBy(desc(telegramBots.sortOrder), telegramBots.id);
    return {
      bots: rows.map((bot) => ({
        id: bot.id,
        name: bot.displayName ?? bot.username ?? bot.id,
        username: bot.username,
        displayName: bot.displayName,
        telegramId: bot.telegramId,
        status: bot.status,
        autoResponder: bot.autoResponder,
        weight: bot.weight,
        sentCount: bot.sentCount,
        blockedCount: bot.blockedCount,
        startsCount: bot.startsCount,
        interactionsCount: bot.interactionsCount,
        repliesCount: bot.repliesCount,
        bannedAt: bot.bannedAt,
        lastBanReason: bot.lastBanReason,
        lastCheckedAt: bot.lastCheckedAt,
        lastError: bot.lastError,
        hasToken: Boolean(bot.tokenEncrypted),
        // Only the masked form is sent to the browser, never the token itself.
        tokenHint: bot.tokenEncrypted ? maskToken(decryptToken(bot.tokenEncrypted) ?? "") : null,
      })),
      storageEnabled: tokenStorageEnabled(),
    };
  });

  /** Add a new bot: the token is checked with getMe, then stored encrypted. */
  app.post("/api/admin/telegram/bots/add", async (req) => {
    requireAdmin(req);
    if (!tokenStorageEnabled()) {
      throw badRequest("Máy chủ chưa cấu hình TOKEN_ENCRYPTION_KEY nên chưa thể thêm bot từ web.");
    }
    const body = parse(botAddBody, req.body);

    const check = await verifyToken(body.token);
    if (!check.ok) throw badRequest(check.error ?? "Token không hợp lệ.");

    const id = randomUUID().replace(/-/g, "").slice(0, 16);
    const encrypted = encryptToken(body.token);

    // A bot with the same Telegram id must not be registered twice.
    const existing = await db.select().from(telegramBots).where(eq(telegramBots.telegramId, check.telegramId!)).limit(1);
    if (existing.length) throw badRequest("Bot này đã có trong danh sách.");

    await db.insert(telegramBots).values({
      id,
      username: check.username ?? null,
      displayName: body.name || check.displayName || null,
      telegramId: check.telegramId ?? null,
      status: "live",
      autoResponder: body.autoResponder ?? true,
      weight: body.weight ?? 1,
      tokenEncrypted: encrypted,
      lastCheckedAt: new Date(),
      lastError: null,
    });

    // The bot service has to open the new connection. When it cannot be
    // reached the bot stays in the list but is marked as unknown.
    const delivered = await notifyBotService("add", id, body.token);
    if (!delivered) {
      await db.update(telegramBots).set({ status: "unknown", lastError: "Chưa đồng bộ được sang dịch vụ bot." }).where(eq(telegramBots.id, id));
    }

    const [bot] = await db.select().from(telegramBots).where(eq(telegramBots.id, id)).limit(1);
    return { bot, synced: delivered };
  });

  /** Remove a bot and forget its token. */
  app.post("/api/admin/telegram/bots/:id/remove", async (req) => {
    requireAdmin(req);
    const { id } = z.object({ id: z.string().trim().max(64) }).parse(req.params);
    const [bot] = await db.select().from(telegramBots).where(eq(telegramBots.id, id)).limit(1);
    if (!bot) throw notFound("Không tìm thấy bot.");
    await db.delete(telegramBots).where(eq(telegramBots.id, id));
    await notifyBotService("remove", id);
    return { ok: true };
  });

  /**
   * Import the bots of the old system in one go.
   *
   * The tokens arrive in clear text and are encrypted right away, exactly like
   * a bot added by hand. Every bot is checked against Telegram first, so a
   * dead token is reported instead of being stored silently.
   */
  app.post("/api/admin/telegram/bots/import", { config: { bodyLimit: 8 * 1024 * 1024 } }, async (req) => {
    requireAdmin(req);
    if (!tokenStorageEnabled()) {
      throw badRequest("Máy chủ chưa cấu hình TOKEN_ENCRYPTION_KEY nên chưa thể nhập bot.");
    }
    const body = parse(importBotsBody, req.body);
    const now = new Date();
    const result: {
      imported: string[];
      failed: { oldId: string; reason: string }[];
      skipped: string[];
      synced: number;
    } = { imported: [], failed: [], skipped: [], synced: 0 };

    for (const entry of body.bots) {
      // The same Telegram bot must not be registered twice.
      const check = await verifyToken(entry.token);
      // A bot the old system already reported as banned stays in the list —
      // the admin wants to see it, marked as banned. Every other dead token
      // is reported instead of being stored.
      if (!check.ok && entry.status !== "ban") {
        result.failed.push({ oldId: entry.oldId, reason: check.error ?? "Token không hợp lệ." });
        continue;
      }
      // A banned bot has no username any more, so the old name is used.
      const username = check.username ?? entry.username ?? null;
      const telegramId = check.telegramId ?? null;
      const displayName = entry.name || check.displayName || entry.username || entry.oldId;
      // A banned token is dead — there is no point in keeping it.
      const tokenUsable = check.ok;

      // A live bot must not be registered twice.
      if (telegramId) {
        const existing = await db.select().from(telegramBots).where(eq(telegramBots.telegramId, telegramId)).limit(1);
        if (existing.length) {
          result.skipped.push(entry.oldId);
          continue;
        }
      }

      // The old id is kept so the links and the counters of the past still
      // match. A bot that is already there is never written twice.
      const wantedId = entry.oldId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || randomUUID().replace(/-/g, "").slice(0, 16);
      const [sameId] = await db.select({ id: telegramBots.id }).from(telegramBots).where(eq(telegramBots.id, wantedId)).limit(1);
      if (sameId) {
        result.skipped.push(entry.oldId);
        continue;
      }
      const id = wantedId;

      await db.insert(telegramBots).values({
        id,
        username,
        displayName,
        telegramId,
        // A bot the old system already reported as banned stays banned.
        status: entry.status === "ban" ? "ban" : "live",
        autoResponder: entry.autoResponder,
        weight: entry.weight,
        sentCount: entry.messagesSent,
        startsCount: entry.startsCount,
        interactionsCount: entry.interactionsCount,
        repliesCount: entry.repliesCount,
        bannedAt: entry.status === "ban" ? now : null,
        lastBanReason: entry.status === "ban" ? "Bị ban ở hệ thống cũ." : null,
        // A banned token is dead — there is no point in keeping it.
        tokenEncrypted: tokenUsable ? encryptToken(entry.token) : null,
        lastCheckedAt: now,
        lastError: entry.status === "ban" ? "Bot bị Telegram cấm (401)." : null,
      });

      if (entry.status === "ban") {
        await db.insert(telegramBotIncidents).values({
          botId: id,
          botUsername: username,
          kind: "ban",
          message: "Bot đã bị Telegram ban trước khi chuyển sang hệ thống mới.",
          detectedAt: now,
        });
      }

      // Hand the token over to the bot service so it can open the connection.
      if (await notifyBotService("add", id, entry.token)) result.synced++;
      result.imported.push(id);
    }

    /* ---- the id list and the people who pressed /start ---- */
    let idsImported = 0;
    const chunkSize = 1000;
    if (body.ids?.length) {
      for (let i = 0; i < body.ids.length; i += chunkSize) {
        const chunk = body.ids.slice(i, i + chunkSize);
        await db
          .insert(telegramUsers)
          .values(
            chunk.map((row) => ({
              telegramId: row.telegramId,
              username: row.username ?? null,
              firstName: row.firstName ?? null,
              ageVerifiedAt: row.ageVerified ? now : null,
              captchaOk: row.captchaOk,
              status: row.status,
              notifyEnabled: true,
              createdAt: now,
              updatedAt: now,
            })),
          )
          .onConflictDoNothing();
        idsImported += chunk.length;
      }
    }

    let linksImported = 0;
    if (body.startedBy && Object.keys(body.startedBy).length) {
      // Only the bots that really exist can be linked.
      const known = await db.select({ id: telegramBots.id }).from(telegramBots);
      const knownIds = new Set(known.map((b) => b.id));
      for (const [botId, telegramIds] of Object.entries(body.startedBy)) {
        if (!knownIds.has(botId)) continue;
        for (let i = 0; i < telegramIds.length; i += chunkSize) {
          const chunk = telegramIds.slice(i, i + chunkSize);
          // The link points at the primary key of the person, not at the
          // Telegram id — the foreign key would refuse the row otherwise.
          const people = await db
            .select({ id: telegramUsers.id, telegramId: telegramUsers.telegramId })
            .from(telegramUsers)
            .where(inArray(telegramUsers.telegramId, chunk));
          const byTelegramId = new Map(people.map((p) => [p.telegramId, p.id]));
          // The people who are not in the id list are created now.
          const missing = chunk.filter((tid) => !byTelegramId.has(tid));
          if (missing.length) {
            const created = await db
              .insert(telegramUsers)
              .values(missing.map((telegramId) => ({ telegramId, status: "unknown" as const, notifyEnabled: true, createdAt: now, updatedAt: now })))
              .onConflictDoNothing()
              .returning({ id: telegramUsers.id, telegramId: telegramUsers.telegramId });
            for (const person of created) byTelegramId.set(person.telegramId, person.id);
            idsImported += created.length;
          }
          const rows = chunk
            .map((telegramId) => {
              const id = byTelegramId.get(telegramId);
              return id ? { telegramId: id, botId, startedAt: now } : null;
            })
            .filter((row): row is { telegramId: number; botId: string; startedAt: Date } => row !== null);
          if (!rows.length) continue;
          const inserted = await db
            .insert(telegramUserLinks)
            .values(rows)
            .onConflictDoNothing()
            .returning({ telegramId: telegramUserLinks.telegramId });
          linksImported += inserted.length;
        }
      }
    }

    return { ...result, idsImported, linksImported };
  });

  /**
   * Check every bot against Telegram and report the ones that died.
   *
   * The admin runs this from the panel; a ban is written to the incident log
   * so it never stays unnoticed.
   */
  app.post("/api/admin/telegram/bots/health-check", async (req) => {
    requireAdmin(req);
    const rows = await db.select().from(telegramBots);
    const now = new Date();
    const report: { id: string; name: string; status: string; reason?: string }[] = [];

    for (const bot of rows) {
      if (!bot.tokenEncrypted) {
        report.push({ id: bot.id, name: bot.displayName ?? bot.id, status: bot.status, reason: "Chưa có token trong hệ thống mới." });
        continue;
      }
      const token = decryptToken(bot.tokenEncrypted);
      if (!token) {
        report.push({ id: bot.id, name: bot.displayName ?? bot.id, status: bot.status, reason: "Không giải mã được token." });
        continue;
      }
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
        // A bot that comes back to life must not be reported as banned again.
        if (previous === "ban") {
          await db.delete(telegramBotIncidents).where(and(eq(telegramBotIncidents.botId, bot.id), eq(telegramBotIncidents.kind, "ban")));
        }
        report.push({ id: bot.id, name: bot.displayName ?? bot.id, status: "live" });
        continue;
      }

      const banned = /401|cấm|thu hồi/i.test(check.error ?? "");
      await db
        .update(telegramBots)
        .set({
          status: banned ? "ban" : "error",
          lastCheckedAt: now,
          lastError: check.error ?? "Không kiểm tra được bot.",
          bannedAt: banned ? now : bot.bannedAt,
          lastBanReason: banned ? check.error : bot.lastBanReason,
        })
        .where(eq(telegramBots.id, bot.id));

      // Only a NEW ban is worth an entry in the report.
      if (banned && previous !== "ban") {
        await db.insert(telegramBotIncidents).values({
          botId: bot.id,
          botUsername: bot.username,
          kind: "ban",
          message: check.error ?? "Bot bị Telegram cấm (401).",
          detectedAt: now,
        });
      }
      report.push({ id: bot.id, name: bot.displayName ?? bot.id, status: banned ? "ban" : "error", reason: check.error });
    }

    return { checked: rows.length, report };
  });

  /** The list of incidents — a ban must never stay unnoticed. */
  app.get("/api/admin/telegram/bots/incidents", async (req) => {
    requireAdmin(req);
    const query = (req.query ?? {}) as Record<string, unknown>;
    const limit = z.coerce.number().int().min(1).max(200).default(50).parse(query.limit ?? 50);
    const rows = await db
      .select()
      .from(telegramBotIncidents)
      .orderBy(desc(telegramBotIncidents.detectedAt))
      .limit(limit);
    return { incidents: rows };
  });

  /* ---------------- settings ---------------- */

  /** The whole settings block of the Telegram side. */
  app.get("/api/admin/telegram/settings", async (req) => {
    requireAdmin(req);
    const [keyboard, templates, slogans, schedule, greeting] = await Promise.all([
      readSetting("keyboard", { enabled: false, prompt: "", rows: [] as unknown[] }),
      readSetting("templates", [] as unknown[]),
      readSetting("slogans", { enabled: false, items: [] as unknown[] }),
      readSetting("schedule", { hour: 9, minute: 0, enabled: false }),
      readSetting<StoredGreeting>("greeting", { enabled: false, keepButtons: true, items: [] }),
    ]);
    return { keyboard, templates, slogans, schedule, greeting };
  });

  /**
   * The settings the bot service needs.
   *
   * The bot reads this to build its reply keyboard, to send the slogan and to
   * greet the people who press /start.
   * Only the internal secret is accepted, never an admin session.
   */
  app.get("/api/bot/settings", { preHandler: requireBotSecret }, async () => {
    const [keyboard, slogans, greeting] = await Promise.all([
      readSetting("keyboard", { enabled: false, prompt: "", rows: [] as unknown[] }),
      readSetting("slogans", { enabled: false, items: [] as unknown[] }),
      readSetting<StoredGreeting>("greeting", { enabled: false, keepButtons: true, items: [] }),
    ]);
    return { keyboard, slogans, greeting: await resolveGreeting(greeting) };
  });

  /** Save the reply keyboard of the bot. */
  app.put("/api/admin/telegram/settings/keyboard", async (req) => {
    requireAdmin(req);
    const body = parse(keyboardBody, req.body);
    const clean = {
      enabled: body.enabled,
      prompt: body.prompt.slice(0, 500),
      rows: body.rows.slice(0, 12).map((row) =>
        row.slice(0, 4).map((cell) => ({
          label: cell.label.slice(0, 64),
          type: cell.type,
          ...(cell.body ? { body: cell.body.slice(0, 1000) } : {}),
          ...(cell.url ? { url: cell.url.slice(0, 500) } : {}),
          ...(cell.albumId ? { albumId: cell.albumId.slice(0, 64) } : {}),
        })),
      ),
    };
    await writeSetting("keyboard", clean);
    return { keyboard: clean };
  });

  /** Save the list of message templates. */
  app.put("/api/admin/telegram/settings/templates", async (req) => {
    requireAdmin(req);
    const body = parse(z.array(templateBody).max(100), req.body);
    const clean = body.map((item) => ({
      id: item.id ?? randomUUID().slice(0, 8),
      title: item.title.slice(0, 80),
      text: item.text.slice(0, 2000),
    }));
    await writeSetting("templates", clean);
    return { templates: clean };
  });

  /** Save the slogans. */
  app.put("/api/admin/telegram/settings/slogans", async (req) => {
    requireAdmin(req);
    const body = parse(
      z.object({
        enabled: z.boolean(),
        items: z.array(z.object({ text: z.string().trim().min(1).max(300), delayAfter: z.number().min(0).max(30).optional() })).max(50),
      }),
      req.body,
    );
    const clean = {
      enabled: body.enabled,
      items: body.items.map((item) => ({ text: item.text.slice(0, 300), delayAfter: item.delayAfter ?? 1 })),
    };
    await writeSetting("slogans", clean);
    return { slogans: clean };
  });

  /** Save the greeting the bot sends when somebody presses /start. */
  app.put("/api/admin/telegram/settings/greeting", async (req) => {
    requireAdmin(req);
    const body = parse(greetingBody, req.body);
    const clean = {
      enabled: body.enabled,
      keepButtons: body.keepButtons,
      items: body.items.map((item, index) => ({
        id: item.id ?? `g${index + 1}`,
        text: item.text.slice(0, 2000),
        media: {
          type: item.media?.type ?? "none",
          key: item.media?.key?.slice(0, 64) || null,
          source: item.media?.source ?? null,
        },
        buttons: item.buttons.map((button) => ({
          label: button.label.slice(0, 64),
          url: button.url.slice(0, 500),
        })),
        link: {
          articleId: item.link?.articleId ?? null,
          url: item.link?.url?.slice(0, 500) || null,
        },
      })),
    };
    await writeSetting("greeting", clean);
    return { greeting: clean };
  });

  /**
   * Upload a media file for a greeting.
   *
   * The file is stored in the media folder of the site and described the same
   * way the campaigns describe their media, so the bot can send it as it is.
   */
  app.post(
    "/api/admin/telegram/settings/greeting/media",
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

  /** Save the daily send hour (Vietnam time). */
  app.put("/api/admin/telegram/settings/schedule", async (req) => {
    requireAdmin(req);
    const body = parse(
      z.object({
        enabled: z.boolean(),
        hour: z.number().int().min(0).max(23),
        minute: z.number().int().min(0).max(59),
      }),
      req.body,
    );
    const clean = { enabled: body.enabled, hour: body.hour, minute: body.minute };
    await writeSetting("schedule", clean);
    return { schedule: clean };
  });

  /* ---------------- imported ids ---------------- */

  /** Import a list of Telegram ids (the text of a .txt or .csv file). */
  app.post("/api/admin/telegram/ids/import", async (req) => {
    requireAdmin(req);
    const body = parse(importIdsBody, req.body);
    const ids = extractIds(body.content);
    if (!ids.length) throw badRequest("Không tìm thấy ID Telegram nào trong nội dung.");

    const now = new Date();
    // The imported ids are stored as telegram users so the rest of the system
    // (campaigns, statistics) can use them right away.
    await db
      .insert(telegramUsers)
      .values(ids.map((telegramId) => ({ telegramId, status: "unknown" as const, notifyEnabled: true, createdAt: now, updatedAt: now })))
      .onConflictDoNothing();

    const [total] = await db.select({ n: count() }).from(telegramUsers);
    return { imported: ids.length, total: total?.n ?? ids.length, filename: body.filename ?? null };
  });

  /** Statistics of the imported ids grouped by status. */
  app.get("/api/admin/telegram/ids/stats", async (req) => {
    requireAdmin(req);
    const rows = await db.select({ status: telegramUsers.status, n: count() }).from(telegramUsers).groupBy(telegramUsers.status);
    const stats: Record<string, number> = { total: 0, unknown: 0, active: 0, blocked: 0, opted_out: 0 };
    for (const row of rows) {
      const key = row.status ?? "unknown";
      stats[key] = row.n;
      stats.total += row.n;
    }
    return { stats };
  });

  /**
   * The live numbers of the emergency campaign that is running right now.
   *
   * The panel of the id list polls this endpoint, so the admin sees how many
   * ids are already sent, how many failed and how many are still on their
   * way (B117).
   */
  app.get("/api/admin/telegram/ids/live-stats", async (req) => {
    requireAdmin(req);
    // The campaigns that are still moving.
    const running = await db
      .select()
      .from(telegramCampaigns)
      .where(inArray(telegramCampaigns.status, ["queued", "sending", "active"]))
      .orderBy(desc(telegramCampaigns.createdAt))
      .limit(5);

    const campaigns = [];
    for (const campaign of running) {
      const rows = await db
        .select({ status: notificationJobs.status, n: count() })
        .from(notificationJobs)
        .where(eq(notificationJobs.campaignId, campaign.id))
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
      campaigns.push({
        id: campaign.id,
        name: campaign.name,
        isEmergency: campaign.isEmergency,
        status: campaign.status,
        total,
        ...jobs,
        done,
        pending: total - done,
        percent: total ? Math.round((done / total) * 100) : 0,
      });
    }

    // The totals of every job, so the panel keeps showing something even
    // when no campaign is running.
    const allRows = await db
      .select({ status: notificationJobs.status, n: count() })
      .from(notificationJobs)
      .groupBy(notificationJobs.status);
    const totals: Record<string, number> = {
      queued: 0,
      sending: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      cancelled: 0,
    };
    for (const row of allRows) totals[row.status] = row.n;

    // The bots that carried the most messages of the running campaigns.
    const botRows = await db
      .select({ botId: notificationJobs.botId, n: count() })
      .from(notificationJobs)
      .where(and(eq(notificationJobs.status, "sent"), isNotNull(notificationJobs.botId)))
      .groupBy(notificationJobs.botId)
      .orderBy(desc(count()))
      .limit(10);

    return {
      campaigns,
      totals,
      running: campaigns.length > 0,
      bots: botRows.map((b) => ({ botId: b.botId, sent: b.n })),
    };
  });

  /** Delete every imported id that is not linked to an account. */
  app.post("/api/admin/telegram/ids/clear", async (req) => {
    requireAdmin(req);
    const linked = db
      .select({ telegramId: telegramUserLinks.telegramId })
      .from(telegramUserLinks);
    const removed = await db.delete(telegramUsers).where(sql`${telegramUsers.telegramId} NOT IN ${linked}`).returning({ telegramId: telegramUsers.telegramId });
    return { removed: removed.length };
  });

  /** Delete one imported id. */
  app.post("/api/admin/telegram/ids/:telegramId/delete", async (req) => {
    requireAdmin(req);
    const { telegramId } = z.object({ telegramId: z.coerce.number().int().positive() }).parse(req.params);
    const removed = await db.delete(telegramUsers).where(eq(telegramUsers.telegramId, telegramId)).returning({ telegramId: telegramUsers.telegramId });
    if (!removed.length) throw notFound("Không tìm thấy ID này.");
    return { ok: true };
  });

  /* ---------------- per bot statistics ---------------- */

  /** Delivery statistics of every bot, so the admin sees which bot performs best. */
  app.get("/api/admin/telegram/bots/stats", async (req) => {
    requireAdmin(req);
    const bots = await db.select().from(telegramBots).orderBy(desc(telegramBots.sortOrder), telegramBots.id);
    const deliveries = await db
      .select({ botId: deliveryLog.botId, status: deliveryLog.status, n: count() })
      .from(deliveryLog)
      .groupBy(deliveryLog.botId, deliveryLog.status);
    const links = await db
      .select({ botId: telegramUserLinks.botId, n: count() })
      .from(telegramUserLinks)
      .groupBy(telegramUserLinks.botId);

    const countFor = (botId: string, status: string) =>
      deliveries.find((d) => d.botId === botId && d.status === status)?.n ?? 0;

    return {
      bots: bots.map((bot) => {
        const sent = countFor(bot.id, "sent");
        const failed = countFor(bot.id, "failed");
        const total = sent + failed;
        return {
          id: bot.id,
          name: bot.displayName ?? bot.username ?? bot.id,
          status: bot.status,
          weight: bot.weight,
          sentCount: bot.sentCount,
          blockedCount: bot.blockedCount,
          links: links.find((l) => l.botId === bot.id)?.n ?? 0,
          sent,
          failed,
          successRate: total ? Math.round((sent / total) * 100) : null,
        };
      }),
    };
  });

  /* ---------------- campaigns summary ---------------- */

  /** A quick overview of the campaigns for the admin dashboard. */
  app.get("/api/admin/telegram/campaigns/summary", async (req) => {
    requireAdmin(req);
    const rows = await db.select().from(telegramCampaigns).orderBy(desc(telegramCampaigns.createdAt)).limit(200);
    const counts = rows.reduce<Record<string, number>>((acc, row) => {
      const key = row.status ?? "draft";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    return {
      total: rows.length,
      counts,
      recent: rows.slice(0, 5).map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        createdAt: row.createdAt,
      })),
    };
  });
}

/**
 * Extract the numeric Telegram ids out of a block of text.
 *
 * A .csv file may contain other columns, so every group of digits that fits
 * into a Telegram id is kept.
 */
export function extractIds(content: string): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  // Telegram ids are positive and up to 13 digits at the moment.
  const re = /\b\d{5,13}\b/g;
  for (const match of content.matchAll(re)) {
    const value = Number(match[0]);
    if (!Number.isSafeInteger(value) || value <= 0) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
