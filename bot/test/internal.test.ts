import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, describe, it } from "node:test";

process.env.BOT_API_SECRET = "test-secret-123";
process.env.BOT_INTERNAL_PORT = "0";

const { startVerifyServer } = await import("../src/internal-server.js");
const { verifyInitData } = await import("../src/verifier.js");

const TOKEN = "111111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

type Server = Awaited<ReturnType<typeof startVerifyServer>>;
let server: Server;
let base = "";

/** Build a signed initData payload. */
function makeInitData(authDate: number): string {
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("user", JSON.stringify({ id: 700001, first_name: "Test" }));
  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== "hash") pairs.push(`${key}=${value}`);
  });
  const hash = createHmac("sha256", secret).update(pairs.join("\n")).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

before(async () => {
  server = await startVerifyServer({
    tokens: [TOKEN],
    host: "127.0.0.1",
    port: 0,
    checkBot: (botId) => (botId === "bot-a" ? { status: "live", error: null } : null),
  });
  const address = server.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await server?.close();
});

describe("The internal service of the bot", () => {
  it("refuses a call without the shared secret", async () => {
    const res = await fetch(`${base}/internal/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData: "x" }),
    });
    assert.equal(res.status, 401);
  });

  it("refuses a call with the wrong secret", async () => {
    const res = await fetch(`${base}/internal/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bot-secret": "wrong" },
      body: JSON.stringify({ initData: "x" }),
    });
    assert.equal(res.status, 401);
  });

  it("verifies a correct initData", async () => {
    const initData = makeInitData(Math.floor(Date.now() / 1000));
    const res = await fetch(`${base}/internal/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bot-secret": "test-secret-123" },
      body: JSON.stringify({ initData }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.telegramId, 700001);
    assert.equal(body.firstName, "Test");
    // The signed payload must never be echoed back.
    assert.ok(!JSON.stringify(body).includes("hash"));
  });

  it("refuses a broken initData", async () => {
    const res = await fetch(`${base}/internal/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bot-secret": "test-secret-123" },
      body: JSON.stringify({ initData: "garbage" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, false);
  });

  it("answers a health request", async () => {
    const res = await fetch(`${base}/internal/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.bots, 1);
  });

  it("checks one bot on demand", async () => {
    const res = await fetch(`${base}/internal/check-bot`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bot-secret": "test-secret-123" },
      body: JSON.stringify({ botId: "bot-a" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.status, "live");
  });

  it("refuses a check without the secret or with an unknown bot", async () => {
    const noSecret = await fetch(`${base}/internal/check-bot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ botId: "bot-a" }),
    });
    assert.equal(noSecret.status, 401);

    const unknown = await fetch(`${base}/internal/check-bot`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bot-secret": "test-secret-123" },
      body: JSON.stringify({ botId: "bot-khong-ton-tai" }),
    });
    assert.equal(unknown.status, 404);

    const noId = await fetch(`${base}/internal/check-bot`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bot-secret": "test-secret-123" },
      body: JSON.stringify({}),
    });
    assert.equal(noId.status, 400);
  });
});

describe("The verifier without a token list", () => {
  it("refuses every payload when there is no token", () => {
    assert.equal(verifyInitData(makeInitData(Math.floor(Date.now() / 1000)), []).ok, false);
  });
});

describe("Adding a bot at runtime", () => {
  /** The tokens the service knows, a bot may be added while it runs. */
  let tokens = [TOKEN];
  /** The changes the registry was asked to apply. */
  const applied: { action: string; botId: string; token?: string }[] = [];

  let runtimeServer: Server;
  let runtimeBase = "";

  before(async () => {
    runtimeServer = await startVerifyServer({
      tokens: () => tokens,
      host: "127.0.0.1",
      port: 0,
      applyBot: (action, botId, token) => {
        applied.push({ action, botId, token });
        if (action === "add" && token) tokens = [...tokens, token];
        if (action === "remove") tokens = tokens.filter((t) => t !== botId);
        return true;
      },
    });
    const address = runtimeServer.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    runtimeBase = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await runtimeServer?.close();
  });

  it("refuses a call without the shared secret", async () => {
    const res = await fetch(`${runtimeBase}/internal/bot-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "add", botId: "bot-b", token: "222:BBB" }),
    });
    assert.equal(res.status, 401);
    assert.equal(applied.length, 0);
  });

  it("refuses an unknown action or a missing token", async () => {
    const badAction = await fetch(`${runtimeBase}/internal/bot-token`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bot-secret": "test-secret-123" },
      body: JSON.stringify({ action: "hack", botId: "bot-b" }),
    });
    assert.equal(badAction.status, 400);

    const noToken = await fetch(`${runtimeBase}/internal/bot-token`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bot-secret": "test-secret-123" },
      body: JSON.stringify({ action: "add", botId: "bot-b" }),
    });
    assert.equal(noToken.status, 400);

    const noId = await fetch(`${runtimeBase}/internal/bot-token`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bot-secret": "test-secret-123" },
      body: JSON.stringify({ action: "remove" }),
    });
    assert.equal(noId.status, 400);
    assert.equal(applied.length, 0);
  });

  it("adds a bot and uses its token right away", async () => {
    const res = await fetch(`${runtimeBase}/internal/bot-token`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bot-secret": "test-secret-123" },
      body: JSON.stringify({ action: "add", botId: "bot-b", token: "222222:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" }),
    });
    assert.equal(res.status, 200);
    assert.equal(applied.length, 1);
    assert.equal(applied[0].action, "add");
    assert.equal(applied[0].botId, "bot-b");

    // The new token must work for the verifier without a restart.
    const secret = createHmac("sha256", "WebAppData").update("222222:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB").digest();
    const params = new URLSearchParams();
    params.set("auth_date", String(Math.floor(Date.now() / 1000)));
    params.set("user", JSON.stringify({ id: 700002, first_name: "New" }));
    const pairs: string[] = [];
    params.forEach((value, key) => {
      if (key !== "hash") pairs.push(`${key}=${value}`);
    });
    params.set("hash", createHmac("sha256", secret).update(pairs.join("\n")).digest("hex"));

    const verified = await fetch(`${runtimeBase}/internal/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bot-secret": "test-secret-123" },
      body: JSON.stringify({ initData: params.toString() }),
    });
    assert.equal(verified.status, 200);
    const body = await verified.json();
    assert.equal(body.ok, true);
    assert.equal(body.telegramId, 700002);
  });

  it("removes a bot", async () => {
    const res = await fetch(`${runtimeBase}/internal/bot-token`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bot-secret": "test-secret-123" },
      body: JSON.stringify({ action: "remove", botId: "bot-b" }),
    });
    assert.equal(res.status, 200);
    assert.equal(applied[applied.length - 1].action, "remove");
  });
});
