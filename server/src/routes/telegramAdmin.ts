import { randomUUID } from "node:crypto";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth.js";
import { db } from "../db/index.js";
import { isValidBotSecret } from "../telegram.js";
import {
  deliveryLog,
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
/**
 * Management endpoints of the Telegram side that the old Python dashboard had:
 * bots, the reply keyboard, the message templates, the imported id list and
 * the bot settings.
 */

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

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

/** One bot of the migration payload. */
const importBotBody = z.object({
  /** The id the old system used — kept so the links of the past stay readable. */
  oldId: z.string().trim().min(1).max(64),
  name: z.string().trim().max(80).optional(),
  username: z.string().trim().max(64).optional(),
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
        username: z.string().trim().max(64).optional(),
        firstName: z.string().trim().max(80).optional(),
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
  app.post("/api/admin/telegram/bots/import", async (req) => {
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
      if (!check.ok) {
        result.failed.push({ oldId: entry.oldId, reason: check.error ?? "Token không hợp lệ." });
        continue;
      }
      const existing = await db.select().from(telegramBots).where(eq(telegramBots.telegramId, check.telegramId!)).limit(1);
      if (existing.length) {
        result.skipped.push(entry.oldId);
        continue;
      }

      // Keep the old id when it is free, so old links and analytics still match.
      let id = entry.oldId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || randomUUID().replace(/-/g, "").slice(0, 16);
      const [sameId] = await db.select({ id: telegramBots.id }).from(telegramBots).where(eq(telegramBots.id, id)).limit(1);
      if (sameId) id = `${id}_${randomUUID().replace(/-/g, "").slice(0, 6)}`;

      await db.insert(telegramBots).values({
        id,
        username: check.username ?? entry.username ?? null,
        displayName: entry.name || check.displayName || entry.username || id,
        telegramId: check.telegramId ?? null,
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
        tokenEncrypted: encryptToken(entry.token),
        lastCheckedAt: now,
        lastError: entry.status === "ban" ? "Bot bị Telegram cấm (401)." : null,
      });

      if (entry.status === "ban") {
        await db.insert(telegramBotIncidents).values({
          botId: id,
          botUsername: check.username ?? entry.username ?? null,
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
          const chunk = telegramIds.slice(i, i + chunkSize).map((tid) => ({
            telegramId: tid,
            botId,
            startedAt: now,
          }));
          const inserted = await db.insert(telegramUserLinks).values(chunk).onConflictDoNothing().returning({ telegramId: telegramUserLinks.telegramId });
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
    const [keyboard, templates, slogans, schedule] = await Promise.all([
      readSetting("keyboard", { enabled: false, prompt: "", rows: [] as unknown[] }),
      readSetting("templates", [] as unknown[]),
      readSetting("slogans", { enabled: false, items: [] as unknown[] }),
      readSetting("schedule", { hour: 9, minute: 0, enabled: false }),
    ]);
    return { keyboard, templates, slogans, schedule };
  });

  /**
   * The settings the bot service needs.
   *
   * The bot reads this to build its reply keyboard and to send the slogan.
   * Only the internal secret is accepted, never an admin session.
   */
  app.get("/api/bot/settings", { preHandler: requireBotSecret }, async () => {
    const [keyboard, slogans] = await Promise.all([
      readSetting("keyboard", { enabled: false, prompt: "", rows: [] as unknown[] }),
      readSetting("slogans", { enabled: false, items: [] as unknown[] }),
    ]);
    return { keyboard, slogans };
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
