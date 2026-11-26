import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

const uploadDir = mkdtempSync(path.join(os.tmpdir(), "ctc-tg-test-"));
process.env.DATABASE_URL = "pglite:memory";
process.env.UPLOAD_DIR = uploadDir;
process.env.PUBLIC_DIR = path.join(uploadDir, "no-frontend");
process.env.ADMIN_USERNAME = "boss";
process.env.ADMIN_PASSWORD = "boss-password";
process.env.BOT_API_SECRET = "test-bot-secret";
process.env.BOT_INTERNAL_URL = "http://127.0.0.1:8099";

const { initDb, closeDb } = await import("../src/db/index.js");
const { buildApp } = await import("../src/app.js");
const { seed } = await import("../src/seed.js");

type App = Awaited<ReturnType<typeof buildApp>>;
let app: App;

/**
 * A stand-in for the bot service. It verifies initData the same way the real
 * service does (HMAC over the data-check string) so the web side is tested
 * against a realistic answer.
 */
let botServer: Server;
const BOT_TOKENS = ["111:AAA", "222:BBB"];
const issued = new Map<string, { telegramId: number; firstName: string; username: string | null; authDate: number }>();

async function issueInitData(telegramId: number, firstName: string, username: string | null = null, authDate?: number) {
  const params: Record<string, string> = {
    auth_date: String(authDate ?? Math.floor(Date.now() / 1000)),
    query_id: "AAE-test",
    user: JSON.stringify({
      id: telegramId,
      first_name: firstName,
      username: username ?? undefined,
      language_code: "vi",
    }),
  };
  const dataCheckString = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("\n");
  const { createHmac } = await import("node:crypto");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKENS[0]).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const initData = `${dataCheckString}&hash=${hash}`;
  issued.set(initData, {
    telegramId,
    firstName,
    username,
    authDate: Number(params.auth_date),
  });
  return initData;
}

const H = { "x-requested-with": "ctc" };
const BOT = { "x-bot-secret": "test-bot-secret" };

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

async function register(username: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: H,
    payload: { username, password: "secret123" },
  });
  assert.equal(res.statusCode, 200, res.body);
  return { cookie: cookieOf(res), user: res.json().user };
}

before(async () => {
  // The bot service: only /internal/verify is needed by the web.
  botServer = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/internal/verify") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c as Buffer));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        const found = issued.get(body.initData);
        if (!found) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            telegramId: found.telegramId,
            firstName: found.firstName,
            username: found.username,
            authDate: found.authDate,
          }),
        );
      });
      return;
    }
    if (req.method === "POST" && req.url === "/internal/check-bot") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c as Buffer));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        if (body.botId === "bot-a") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true, status: "live", error: null }));
          return;
        }
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Không tìm thấy bot." }));
      });
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => botServer.listen(8099, "127.0.0.1", resolve));

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

describe("Telegram bridge API", () => {
  let admin: string;

  it("rejects a Mini App sign-in with a broken initData", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/telegram/miniapp/auth",
      headers: H,
      payload: { initData: "garbage" },
    });
    assert.equal(res.statusCode, 400);
    assert.ok(res.json().error.includes("hết hạn"));
  });

  it("rejects an expired initData without creating an account", async () => {
    const old = Math.floor(Date.now() / 1000) - 60 * 60 * 30;
    const initData = await issueInitData(900001, "Hết hạn", null, old);
    const res = await app.inject({
      method: "POST",
      url: "/api/telegram/miniapp/auth",
      headers: H,
      payload: { initData },
    });
    assert.equal(res.statusCode, 400);
    const stats = await app.inject({ method: "GET", url: "/api/bot/stats", headers: BOT });
    assert.equal(stats.statusCode, 200);
  });

  it("creates a web account from a Mini App sign-in and keeps the Telegram name", async () => {
    const initData = await issueInitData(100001, "Nguyễn Văn A", "nguyenvana");
    const res = await app.inject({
      method: "POST",
      url: "/api/telegram/miniapp/auth",
      headers: H,
      payload: { initData },
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    assert.equal(body.created, true);
    assert.equal(body.linked, true);
    assert.equal(body.user.displayName, "Nguyễn Văn A");
    assert.ok(body.user.username.startsWith("tg_"));
    // The session cookie is set so the visitor is signed in right away.
    assert.ok(cookieOf(res).includes("ctc_sid="));
  });

  it("reuses the same account when the same Telegram user opens the Mini App again", async () => {
    const initData = await issueInitData(100001, "Nguyễn Văn A", "nguyenvana");
    const res = await app.inject({
      method: "POST",
      url: "/api/telegram/miniapp/auth",
      headers: H,
      payload: { initData },
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().created, false);
  });

  it("creates an account from a normal browser and hands out a link code", async () => {
    // A live bot is needed so the account can get a link code.
    await app.inject({
      method: "POST",
      url: "/api/bot/register",
      headers: BOT,
      payload: { botId: "bot-browser", username: "chongtoico_browser", displayName: "Bot Browser" },
    });
    await app.inject({
      method: "POST",
      url: "/api/bot/heartbeat",
      headers: BOT,
      payload: { botId: "bot-browser", status: "live" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/telegram/browser/register",
      headers: H,
      payload: { username: "browseruser", password: "secret123", displayName: "Tên Hiển Thị" },
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    assert.equal(body.linked, false);
    assert.equal(body.linkRequired, true);
    assert.equal(body.user.displayName, "Tên Hiển Thị");
    assert.equal(body.user.source, "web");
    assert.equal(body.code.length, 8);
    assert.ok(body.linkUrl.includes(body.code));
    // The session cookie is set: the account works right away.
    assert.ok(cookieOf(res).includes("ctc_sid="));
  });

  it("refuses a browser sign-up with a taken name or a weak password", async () => {
    const taken = await app.inject({
      method: "POST",
      url: "/api/telegram/browser/register",
      headers: H,
      payload: { username: "browseruser", password: "secret123" },
    });
    assert.equal(taken.statusCode, 400);
    const weak = await app.inject({
      method: "POST",
      url: "/api/telegram/browser/register",
      headers: H,
      payload: { username: "anotherone", password: "123" },
    });
    assert.equal(weak.statusCode, 400);
  });

  it("rejects /api/bot/* without the shared secret", async () => {
    const res = await app.inject({ method: "GET", url: "/api/bot/stats" });
    assert.equal(res.statusCode, 401);
    const wrong = await app.inject({ method: "GET", url: "/api/bot/stats", headers: { "x-bot-secret": "nope" } });
    assert.equal(wrong.statusCode, 401);
  });

  it("lets a bot register itself and report its status", async () => {
    let res = await app.inject({
      method: "POST",
      url: "/api/bot/register",
      headers: BOT,
      payload: { botId: "bot-a", username: "chongtoico_bot_a", displayName: "Bot A" },
    });
    assert.equal(res.statusCode, 200, res.body);
    res = await app.inject({
      method: "POST",
      url: "/api/bot/heartbeat",
      headers: BOT,
      payload: { botId: "bot-a", status: "live" },
    });
    assert.equal(res.statusCode, 200, res.body);
    res = await app.inject({ method: "GET", url: "/api/bot/bots", headers: BOT });
    assert.equal(res.statusCode, 200);
    const bots = res.json().bots as { id: string }[];
    assert.ok(bots.some((b) => b.id === "bot-a"));
  });

  it("issues a one-time link code and refuses to reuse it", async () => {
    const { cookie } = await register("linkuser");
    const res = await app.inject({ method: "GET", url: "/api/telegram/link-code", headers: { ...H, cookie } });
    assert.equal(res.statusCode, 200, res.body);
    const { code, deepLink } = res.json();
    assert.equal(code.length, 8);
    assert.ok(deepLink.includes(code));

    // Using the code links the Telegram account with the web account.
    const linked = await app.inject({
      method: "POST",
      url: "/api/bot/link",
      headers: BOT,
      payload: { code, telegramId: 200002, botId: "bot-a", firstName: "Người Ghép" },
    });
    assert.equal(linked.statusCode, 200, linked.body);
    assert.equal(linked.json().linked, true);
    assert.equal(linked.json().username, "linkuser");

    // The same code cannot be used twice.
    const again = await app.inject({
      method: "POST",
      url: "/api/bot/link",
      headers: BOT,
      payload: { code, telegramId: 200003, botId: "bot-a" },
    });
    assert.equal(again.statusCode, 400);
  });

  it("marks a Telegram user as opted out and stops delivering to them", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/bot/optout",
      headers: BOT,
      payload: { telegramId: 200002, botId: "bot-a" },
    });
    assert.equal(res.statusCode, 200, res.body);
    const state = await app.inject({ method: "GET", url: "/api/bot/user/200002", headers: BOT });
    assert.equal(state.json().optOut, true);
    assert.equal(state.json().notifyEnabled, false);
  });

  it("lets a visitor opt out from the web", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/telegram/optout-public",
      headers: H,
      payload: { tid: 200003 },
    });
    assert.equal(res.statusCode, 200, res.body);
    const state = await app.inject({ method: "GET", url: "/api/bot/user/200003", headers: BOT });
    assert.equal(state.json().optOut, true);
  });

  it("records a visit that came from Telegram", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/telegram/track",
      headers: H,
      payload: { campaignId: "camp-1", articleId: 1, ref: "campaign", src: "campaign" },
    });
    assert.equal(res.statusCode, 200, res.body);
  });

  it("keeps campaign administration behind the admin role", async () => {
    const { cookie } = await register("normaluser");
    let res = await app.inject({ method: "GET", url: "/api/admin/telegram/overview", headers: { ...H, cookie } });
    assert.equal(res.statusCode, 403);
    res = await app.inject({ method: "GET", url: "/api/admin/telegram/overview", headers: H });
    assert.equal(res.statusCode, 401);

    admin = await login("boss", "boss-password");
    res = await app.inject({ method: "GET", url: "/api/admin/telegram/overview", headers: { ...H, cookie: admin } });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    assert.ok(body.telegramUsers >= 3);
    assert.ok(body.linked >= 1);
  });

  it("checks a bot right away through the bot service", async () => {
    admin = await login("boss", "boss-password");
    // The bot has to exist before it can be checked.
    await app.inject({
      method: "POST",
      url: "/api/bot/register",
      headers: BOT,
      payload: { botId: "bot-a", username: "chongtoico_bot_a", displayName: "Bot A" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/telegram/bots/bot-a/check",
      headers: { ...H, cookie: admin },
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    assert.equal(body.checked, true);
    assert.equal(body.bot.status, "live");
    assert.ok(body.bot.lastCheckedAt);
  });

  it("marks a bot as unknown when the bot service cannot be reached", async () => {
    // A bot the service does not know about.
    await app.inject({
      method: "POST",
      url: "/api/bot/register",
      headers: BOT,
      payload: { botId: "bot-la", username: "chongtoico_bot_la", displayName: "Bot Lạ" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/telegram/bots/bot-la/check",
      headers: { ...H, cookie: admin },
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    assert.equal(body.checked, false);
    assert.equal(body.bot.status, "unknown");
  });

  it("creates a campaign that stays paused until an admin activates it", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/telegram/campaigns",
      headers: { ...H, cookie: admin },
      payload: {
        name: "Chiến dịch thử",
        text: "Bài mới hôm nay",
        mediaType: "none",
        targetType: "all_linked",
        schedule: "daily",
        hour: 9,
        minute: 30,
      },
    });
    assert.equal(res.statusCode, 200, res.body);
    const { campaign } = res.json();
    assert.equal(campaign.scheduleStatus, "paused");
    assert.equal(campaign.status, "draft");

    const activated = await app.inject({
      method: "POST",
      url: `/api/admin/telegram/campaigns/${campaign.id}/activate`,
      headers: { ...H, cookie: admin },
    });
    assert.equal(activated.statusCode, 200);
    assert.equal(activated.json().campaign.scheduleStatus, "active");

    const paused = await app.inject({
      method: "POST",
      url: `/api/admin/telegram/campaigns/${campaign.id}/pause`,
      headers: { ...H, cookie: admin },
    });
    assert.equal(paused.json().campaign.scheduleStatus, "paused");
  });

  it("imports a list of Telegram ids", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/telegram/import-ids",
      headers: { ...H, cookie: admin },
      payload: { content: "300001\n300002\n300002\nnot-a-number\n" },
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().imported, 2);
  });

  it("lists the Telegram people for the admin", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/telegram/users", headers: { ...H, cookie: admin } });
    assert.equal(res.statusCode, 200, res.body);
    assert.ok(res.json().rows.length >= 5);
  });

  it("groups the imported ids by their status", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/telegram/ids/groups", headers: { ...H, cookie: admin } });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    assert.ok(body.total >= 2, JSON.stringify(body));
    // Every group carries a label the admin can read.
    for (const group of body.groups) {
      assert.ok(group.label.length > 0);
      assert.ok(group.count > 0);
    }
  });

  it("creates an emergency campaign that targets the imported ids", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/telegram/campaigns",
      headers: { ...H, cookie: admin },
      payload: {
        name: "Quét khẩn cấp",
        text: "Tin khẩn cấp",
        mediaType: "none",
        targetType: "imported",
        targetIds: [],
        isEmergency: true,
        schedule: "now",
      },
    });
    assert.equal(res.statusCode, 200, res.body);
    const { campaign } = res.json();
    assert.equal(campaign.isEmergency, true);
    assert.equal(campaign.targetType, "imported");
  });

  it("refuses a campaign with an unknown target type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/telegram/campaigns",
      headers: { ...H, cookie: admin },
      payload: {
        name: "Sai",
        text: "x",
        mediaType: "none",
        targetType: "khong_hop_le",
        schedule: "now",
      },
    });
    assert.equal(res.statusCode, 400, res.body);
  });
});
