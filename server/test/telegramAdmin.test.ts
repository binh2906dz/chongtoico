import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

const uploadDir = mkdtempSync(path.join(os.tmpdir(), "ctc-admin-test-"));
process.env.DATABASE_URL = "pglite:memory";
process.env.UPLOAD_DIR = uploadDir;
process.env.PUBLIC_DIR = path.join(uploadDir, "no-frontend");
process.env.ADMIN_USERNAME = "boss";
process.env.ADMIN_PASSWORD = "boss-password";
process.env.BOT_API_SECRET = "test-bot-secret";
process.env.BOT_INTERNAL_URL = "http://127.0.0.1:8098";
// The web may only store a token when the encryption key is configured.
process.env.TOKEN_ENCRYPTION_KEY = "test-encryption-key-for-the-admin-panel";

const { initDb, closeDb } = await import("../src/db/index.js");
const { buildApp } = await import("../src/app.js");
const { seed } = await import("../src/seed.js");

type App = Awaited<ReturnType<typeof buildApp>>;
let app: App;

/** A stand-in for the bot service. */
let botServer: Server;
/** The calls the web made to the bot service. */
const botCalls: { action: string; botId: string; token?: string }[] = [];

const H = { "x-requested-with": "ctc" };

function cookieOf(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.map((c: string) => c.split(";")[0]).join("; ");
}

async function login(username: string, password: string) {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", headers: H, payload: { username, password } });
  assert.equal(res.statusCode, 200, res.body);
  return cookieOf(res);
}

before(async () => {
  botServer = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/internal/bot-token") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c as Buffer));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        botCalls.push({ action: body.action, botId: body.botId, token: body.token });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false }));
  });
  await new Promise<void>((resolve) => botServer.listen(8098, "127.0.0.1", resolve));

  await initDb("pglite:memory");
  await seed();
  app = await buildApp({ logger: false });
  await app.ready();
});

after(async () => {
  await app?.close();
  await closeDb();
  await new Promise<void>((resolve) => botServer.close(() => resolve()));
  rmSync(uploadDir, { recursive: true, force: true });
});

describe("Telegram management panel", () => {
  let admin = "";

  it("keeps the management endpoints behind the admin role", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/telegram/settings", headers: H });
    assert.equal(res.statusCode, 401);
    admin = await login("boss", "boss-password");
  });

  it("stores the reply keyboard, the templates and the schedule", async () => {
    const keyboard = {
      enabled: true,
      prompt: "👇 Chọn một tùy chọn",
      rows: [[{ label: "Mở website", type: "open_site" }]],
    };
    let res = await app.inject({
      method: "PUT",
      url: "/api/admin/telegram/settings/keyboard",
      headers: { ...H, cookie: admin },
      payload: keyboard,
    });
    assert.equal(res.statusCode, 200, res.body);

    res = await app.inject({
      method: "PUT",
      url: "/api/admin/telegram/settings/templates",
      headers: { ...H, cookie: admin },
      payload: [{ title: "Bài mới", text: "Có bài mới rồi" }],
    });
    assert.equal(res.statusCode, 200, res.body);

    res = await app.inject({
      method: "PUT",
      url: "/api/admin/telegram/settings/schedule",
      headers: { ...H, cookie: admin },
      payload: { enabled: true, hour: 9, minute: 30 },
    });
    assert.equal(res.statusCode, 200, res.body);

    res = await app.inject({ method: "GET", url: "/api/admin/telegram/settings", headers: { ...H, cookie: admin } });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    assert.equal(body.keyboard.enabled, true);
    assert.equal(body.keyboard.rows[0][0].label, "Mở website");
    assert.equal(body.templates.length, 1);
    assert.equal(body.templates[0].title, "Bài mới");
    assert.equal(body.schedule.hour, 9);
    assert.equal(body.schedule.minute, 30);
  });

  it("refuses a schedule outside the valid range", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/telegram/settings/schedule",
      headers: { ...H, cookie: admin },
      payload: { enabled: true, hour: 99, minute: 0 },
    });
    assert.equal(res.statusCode, 400, res.body);
  });

  it("stores a greeting with its media, its buttons and its link", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/telegram/settings/greeting",
      headers: { ...H, cookie: admin },
      payload: {
        enabled: true,
        keepButtons: false,
        items: [
          {
            id: "g1",
            text: "👋 Chào {{name}}\n\n{{link}}",
            media: { type: "image", key: "image:abc123", source: "upload" },
            buttons: [{ label: "👑 Kênh VIP", url: "https://t.me/kenvip" }],
            link: { articleId: null, url: "https://t.me/kenvip" },
          },
        ],
      },
    });
    assert.equal(res.statusCode, 200, res.body);
    const saved = res.json().greeting;
    assert.equal(saved.enabled, true);
    assert.equal(saved.keepButtons, false);
    assert.equal(saved.items[0].media.type, "image");
    assert.equal(saved.items[0].media.key, "image:abc123");
    assert.equal(saved.items[0].buttons[0].label, "👑 Kênh VIP");
    assert.equal(saved.items[0].link.url, "https://t.me/kenvip");
  });

  it("gives the bot the greeting with the resolved link and the media", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/bot/settings",
      headers: { "x-bot-secret": "test-bot-secret" },
    });
    assert.equal(res.statusCode, 200, res.body);
    const greeting = res.json().greeting;
    assert.equal(greeting.enabled, true);
    assert.equal(greeting.items[0].linkUrl, "https://t.me/kenvip");
    assert.equal(greeting.items[0].buttons.length, 1);
    // The media of a file that belongs to no article is still public.
    assert.equal(greeting.items[0].media.kind, "image");
    assert.equal(greeting.items[0].media.isPublic, true);
    // A file the admin uploaded lives in the ads folder.
    assert.ok(greeting.items[0].media.url.endsWith("/media/b/abc123.webp"), greeting.items[0].media.url);
  });

  it("refuses a greeting without a text", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/telegram/settings/greeting",
      headers: { ...H, cookie: admin },
      payload: { enabled: true, keepButtons: true, items: [{ text: "   " }] },
    });
    assert.equal(res.statusCode, 400, res.body);
  });

  it("keeps a file of an article in the folder of the article images", async () => {
    // The media of an article lives with the images of the articles.
    await app.inject({
      method: "PUT",
      url: "/api/admin/telegram/settings/greeting",
      headers: { ...H, cookie: admin },
      payload: {
        enabled: true,
        keepButtons: true,
        items: [
          {
            id: "g2",
            text: "Chào {{name}}",
            media: { type: "image", key: "image:fromarticle", source: "article" },
            buttons: [],
            link: { articleId: null, url: null },
          },
        ],
      },
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/bot/settings",
      headers: { "x-bot-secret": "test-bot-secret" },
    });
    assert.equal(res.statusCode, 200, res.body);
    const greeting = res.json().greeting;
    assert.ok(greeting.items[0].media.url.endsWith("/media/a/fromarticle.webp"), greeting.items[0].media.url);
  });

  it("keeps the greeting endpoints behind the admin role", async () => {
    let res = await app.inject({
      method: "PUT",
      url: "/api/admin/telegram/settings/greeting",
      headers: H,
      payload: { enabled: true, keepButtons: true, items: [] },
    });
    assert.equal(res.statusCode, 401);

    res = await app.inject({
      method: "POST",
      url: "/api/admin/telegram/settings/greeting/media",
      headers: H,
    });
    assert.equal(res.statusCode, 401);
  });

  it("imports ids out of a csv file and counts them by status", async () => {
    const content = "name,id\nAlpha,111222333\nBeta,444555666\nGamma,777888999\nAlpha again,111222333\n";
    let res = await app.inject({
      method: "POST",
      url: "/api/admin/telegram/ids/import",
      headers: { ...H, cookie: admin },
      payload: { content, filename: "list.csv" },
    });
    assert.equal(res.statusCode, 200, res.body);
    // The duplicate must be counted only once.
    assert.equal(res.json().imported, 3);

    res = await app.inject({ method: "GET", url: "/api/admin/telegram/ids/stats", headers: { ...H, cookie: admin } });
    assert.equal(res.statusCode, 200, res.body);
    const stats = res.json().stats;
    assert.ok(stats.total >= 3);
    assert.equal(stats.unknown, stats.total);
  });

  it("reports that the token storage is enabled", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/telegram/bots/list", headers: { ...H, cookie: admin } });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().storageEnabled, true);
  });

  it("never sends a stored token to the browser", async () => {
    // A bot with an encrypted token is written straight into the database.
    const { db } = await import("../src/db/index.js");
    const { telegramBots } = await import("../src/db/schema.js");
    const { encryptToken } = await import("../src/crypto.js");
    await db
      .insert(telegramBots)
      .values({
        id: "bot-secret",
        username: "secret_bot",
        displayName: "Secret bot",
        status: "live",
        tokenEncrypted: encryptToken("123456:AAsecrettokenvalue"),
      })
      .onConflictDoNothing();

    const res = await app.inject({ method: "GET", url: "/api/admin/telegram/bots/list", headers: { ...H, cookie: admin } });
    assert.equal(res.statusCode, 200, res.body);
    const raw = res.body;
    assert.ok(!raw.includes("AAsecrettokenvalue"), "The token must never reach the browser.");
    const bot = res.json().bots.find((b: { id: string }) => b.id === "bot-secret");
    assert.ok(bot);
    assert.equal(bot.hasToken, true);
    assert.ok(bot.tokenHint?.includes("••••"));
  });

  it("removes a bot and tells the bot service about it", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/telegram/bots/bot-secret/remove",
      headers: { ...H, cookie: admin },
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.ok(botCalls.some((c) => c.action === "remove" && c.botId === "bot-secret"));
  });

  it("shows the system information to the admin", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/system/info", headers: { ...H, cookie: admin } });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    // PGlite cannot produce a pg_dump, the panel has to say so.
    assert.equal(body.canDump, false);
    assert.equal(body.database, "PGlite (phát triển)");
    assert.ok(Array.isArray(body.backups));
  });

  it("keeps the system endpoints behind the admin role", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/system/info", headers: H });
    assert.equal(res.statusCode, 401);
  });

  it("refuses to restore a backup while the safety switch is off", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/system/backup/whatever.sql/restore",
      headers: { ...H, cookie: admin },
    });
    assert.equal(res.statusCode, 400, res.body);
    assert.ok(res.json().error.includes("ALLOW_RESTORE"));
  });

  it("imports the bots of the old system with their counters and their people", async () => {
    // The Telegram API cannot be reached from the test, so every token is
    // refused. The import must report that instead of storing a dead token.
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/telegram/bots/import",
      headers: { ...H, cookie: admin },
      payload: {
        bots: [{ oldId: "old-bot-1", name: "Bot cũ", token: "123456789:AAoldtokenvalue123456" }],
        ids: [{ telegramId: 111111, status: "active", ageVerified: true, captchaOk: true, bots: [] }],
        startedBy: { "old-bot-1": [111111] },
      },
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    // The token cannot be verified, so the bot is reported as failed.
    assert.equal(body.failed.length, 1);
    assert.equal(body.failed[0].oldId, "old-bot-1");
    // The id list is still imported — it does not need a valid token.
    assert.equal(body.idsImported, 1);
  });

  it("keeps the import endpoints behind the admin role", async () => {
    const res = await app.inject({ method: "POST", url: "/api/admin/telegram/bots/import", headers: H, payload: { bots: [] } });
    assert.equal(res.statusCode, 401);
  });

  it("imports a bot that was already banned in the old system", async () => {
    // The token of a banned bot is dead, but the admin wants to see the bot in
    // the list — marked as banned. It must not be reported as a failure.
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/telegram/bots/import",
      headers: { ...H, cookie: admin },
      payload: {
        bots: [
          {
            oldId: "old-banned-bot",
            name: "Bot cũ đã ban",
            token: "123456789:AAdeadtokenvalue1234567890",
            status: "ban",
            autoResponder: true,
            weight: 1,
          },
        ],
      },
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    // The banned bot is stored, so the admin can see it.
    assert.equal(body.imported.length, 1);
    assert.equal(body.failed.length, 0, "A banned bot of the old system is not a failure.");

    const list = await app.inject({ method: "GET", url: "/api/admin/telegram/bots/list", headers: { ...H, cookie: admin } });
    const bot = list.json().bots.find((b: { id: string }) => b.id === "old-banned-bot");
    assert.ok(bot, "The banned bot must be in the list.");
    assert.equal(bot.status, "ban");
    assert.ok(bot.bannedAt);
    // A dead token is never kept.
    assert.equal(bot.hasToken, false);
  });

  it("never writes the same bot twice", async () => {
    const payload = {
      bots: [
        {
          oldId: "dup-bot",
          name: "Bot trùng",
          token: "123456789:AAdeadtokenvalue1234567890",
          status: "ban" as const,
          autoResponder: true,
          weight: 1,
        },
      ],
    };
    await app.inject({ method: "POST", url: "/api/admin/telegram/bots/import", headers: { ...H, cookie: admin }, payload });
    const second = await app.inject({ method: "POST", url: "/api/admin/telegram/bots/import", headers: { ...H, cookie: admin }, payload });
    assert.equal(second.statusCode, 200, second.body);
    assert.equal(second.json().imported.length, 0);
    assert.deepEqual(second.json().skipped, ["dup-bot"]);

    const list = await app.inject({ method: "GET", url: "/api/admin/telegram/bots/list", headers: { ...H, cookie: admin } });
    const count = list.json().bots.filter((b: { id: string }) => b.id === "dup-bot").length;
    assert.equal(count, 1, "The bot must appear only once.");
  });

  it("records a ban in the incident list", async () => {
    const { db } = await import("../src/db/index.js");
    const { telegramBots, telegramBotIncidents } = await import("../src/db/schema.js");
    await db
      .insert(telegramBots)
      .values({ id: "bot-banned", displayName: "Bot bị ban", status: "ban", bannedAt: new Date() })
      .onConflictDoNothing();
    await db.insert(telegramBotIncidents).values({ botId: "bot-banned", botUsername: "banned_bot", kind: "ban", message: "Bot bị Telegram cấm (401)." });

    const res = await app.inject({ method: "GET", url: "/api/admin/telegram/bots/incidents", headers: { ...H, cookie: admin } });
    assert.equal(res.statusCode, 200, res.body);
    const incidents = res.json().incidents;
    const found = incidents.find((i: { botId: string }) => i.botId === "bot-banned");
    assert.ok(found, "The ban must be visible in the report.");
    assert.equal(found.kind, "ban");
    assert.ok(found.detectedAt);
  });

  it("shows the ban time of a bot in the bot list", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/telegram/bots/list", headers: { ...H, cookie: admin } });
    assert.equal(res.statusCode, 200, res.body);
    const bot = res.json().bots.find((b: { id: string }) => b.id === "bot-banned");
    assert.ok(bot);
    assert.equal(bot.status, "ban");
    assert.ok(bot.bannedAt, "The time of the ban must be reported.");
  });
});
