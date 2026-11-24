import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHmac } from "node:crypto";
import { parseBotTokens } from "../src/config.js";
import { parseCommand, redactSecrets } from "../src/index.js";
import { buildKeyboard, planMessage, RateLimiter } from "../src/jobs.js";
import { secretMatches } from "../src/internal-server.js";
import { buildDataCheckString, computeHash, safeEqualHex, verifyInitData } from "../src/verifier.js";
import type { Job } from "../src/client.js";

const TOKEN_A = "111111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const TOKEN_B = "222222:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
/** The token without the numeric id that comes in front of it. */
const SECRET_A = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const SECRET_B = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

/** Build a signed initData payload, the way Telegram does. */
function makeInitData(
  user: { id: number; first_name?: string; username?: string },
  authDate: number,
  token = TOKEN_A,
): string {
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("query_id", "AAE_test");
  params.set("user", JSON.stringify(user));
  const check = buildDataCheckString(params);
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

describe("Bot tokens in the configuration", () => {
  it("reads the id and the token of every bot", () => {
    const parsed = parseBotTokens(`${TOKEN_A}, ${TOKEN_B}`);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0]?.id, "111111");
    assert.equal(parsed[0]?.token, SECRET_A);
    assert.equal(parsed[1]?.id, "222222");
    assert.equal(parsed[1]?.token, SECRET_B);
  });

  it("skips the broken entries", () => {
    assert.deepEqual(parseBotTokens(""), []);
    assert.deepEqual(parseBotTokens("khong-co-dau-phay"), []);
    assert.equal(parseBotTokens(":token").length, 0);
    assert.equal(parseBotTokens("id:").length, 0);
  });
});

describe("Verification of the Telegram initData", () => {
  it("accepts a payload signed with a known token", () => {
    const now = 1_800_000_000;
    const initData = makeInitData({ id: 500001, first_name: "Bình", username: "binh" }, now);
    const result = verifyInitData(initData, [TOKEN_A], { now: now * 1000 });
    assert.equal(result.ok, true);
    assert.equal(result.telegramId, 500001);
    assert.equal(result.firstName, "Bình");
    assert.equal(result.username, "binh");
  });

  it("accepts a payload signed with any of the bots", () => {
    const now = 1_800_000_000;
    const initData = makeInitData({ id: 500002 }, now, TOKEN_B);
    const result = verifyInitData(initData, [TOKEN_A, TOKEN_B], { now: now * 1000 });
    assert.equal(result.ok, true);
    assert.equal(result.telegramId, 500002);
  });

  it("refuses a payload signed with an unknown token", () => {
    const now = 1_800_000_000;
    const initData = makeInitData({ id: 500003 }, now, "999999:UNKNOWNUNKNOWNUNKNOWNUNKNOWNUNKN");
    const result = verifyInitData(initData, [TOKEN_A], { now: now * 1000 });
    assert.equal(result.ok, false);
  });

  it("refuses a payload that was tampered with", () => {
    const now = 1_800_000_000;
    const initData = makeInitData({ id: 500004 }, now);
    const parts = new URLSearchParams(initData);
    parts.set("auth_date", String(now - 10));
    const result = verifyInitData(parts.toString(), [TOKEN_A], { now: now * 1000 });
    assert.equal(result.ok, false);
  });

  it("refuses a payload older than the allowed age", () => {
    const now = 1_800_000_000;
    const initData = makeInitData({ id: 500005 }, now - 25 * 3600);
    const result = verifyInitData(initData, [TOKEN_A], { now: now * 1000 });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /hết hạn/);
  });

  it("refuses an empty payload and a payload without a signature", () => {
    assert.equal(verifyInitData("", [TOKEN_A]).ok, false);
    assert.equal(verifyInitData("auth_date=1&user=%7B%22id%22%3A1%7D", [TOKEN_A]).ok, false);
    assert.equal(verifyInitData("hash=abc", [TOKEN_A]).ok, false);
  });

  it("refuses to work without any token", () => {
    const now = 1_800_000_000;
    const initData = makeInitData({ id: 500006 }, now);
    assert.equal(verifyInitData(initData, []).ok, false);
  });

  it("computes the same hash as Telegram does", () => {
    const params = new URLSearchParams();
    params.set("auth_date", "1");
    params.set("user", JSON.stringify({ id: 7 }));
    const expected = createHmac("sha256", createHmac("sha256", "WebAppData").update(TOKEN_A).digest())
      .update(buildDataCheckString(params))
      .digest("hex");
    assert.equal(computeHash(TOKEN_A, buildDataCheckString(params)), expected);
    assert.equal(safeEqualHex(expected, expected), true);
    assert.equal(safeEqualHex(expected, "00"), false);
  });
});

describe("The shared secret", () => {
  it("accepts the right secret and refuses the wrong one", () => {
    assert.equal(secretMatches("abc", "abc"), true);
    assert.equal(secretMatches("abc", "abd"), false);
    assert.equal(secretMatches("abc", "abcd"), false);
    assert.equal(secretMatches(undefined, "abc"), false);
    assert.equal(secretMatches("", ""), false);
  });
});

describe("The commands of the bot", () => {
  it("reads the name and the argument of a command", () => {
    assert.deepEqual(parseCommand("/start"), { name: "start", argument: "" });
    assert.deepEqual(parseCommand("/start ABC123"), { name: "start", argument: "ABC123" });
    assert.deepEqual(parseCommand("/stop"), { name: "stop", argument: "" });
    assert.deepEqual(parseCommand("/start@my_bot"), { name: "start", argument: "" });
    assert.equal(parseCommand("xin chào"), null);
  });
});

describe("Hiding the secrets in the log", () => {
  it("removes a Telegram token from the message", () => {
    const message = `Không gửi được: ${TOKEN_A}`;
    const redacted = redactSecrets(message);
    assert.ok(!redacted.includes(SECRET_A));
    assert.ok(redacted.includes("token đã ẩn"));
  });

  it("removes the shared secret from the message", () => {
    const secret = process.env.BOT_API_SECRET;
    if (!secret) return;
    const redacted = redactSecrets(`secret là ${secret}`);
    assert.ok(!redacted.includes(secret));
  });

  it("leaves an ordinary message alone", () => {
    assert.equal(redactSecrets("Bot đã sẵn sàng."), "Bot đã sẵn sàng.");
  });
});

describe("Sending a message", () => {
  const baseJob: Job = {
    jobId: 1,
    campaignId: "c1",
    telegramId: 500001,
    botId: "bot-a",
    payload: {
      text: "Xin chào",
      parseMode: "HTML",
      buttons: [
        { label: "🌐 Mở Website", url: "https://example.com/" },
        { label: "🔕 Từ chối nhận", url: "https://example.com/tg/stop" },
      ],
      webUrl: "https://example.com/?ref=bot&cid=c1&tid=500001",
      media: null,
    },
  };

  it("sends the message without a file when there is no media", () => {
    assert.deepEqual(planMessage(baseJob), { sendFile: false });
  });

  it("sends the file when the media is small and public", () => {
    const job: Job = {
      ...baseJob,
      payload: {
        ...baseJob.payload,
        media: { kind: "image", url: "https://example.com/a.webp", sizeBytes: 1024, isPublic: true },
      },
    };
    assert.deepEqual(planMessage(job), { sendFile: true });
  });

  it("never sends a file that is only visible to members", () => {
    const job: Job = {
      ...baseJob,
      payload: {
        ...baseJob.payload,
        media: { kind: "image", url: "https://example.com/a.webp", sizeBytes: 1024, isPublic: false },
      },
    };
    const plan = planMessage(job);
    assert.equal(plan.sendFile, false);
    assert.equal(plan.reason, "media_not_public");
  });

  it("never sends an image above 10 MB", () => {
    const job: Job = {
      ...baseJob,
      payload: {
        ...baseJob.payload,
        media: { kind: "image", url: "https://example.com/a.webp", sizeBytes: 11 * 1024 * 1024, isPublic: true },
      },
    };
    const plan = planMessage(job);
    assert.equal(plan.sendFile, false);
    assert.equal(plan.reason, "media_too_large");
  });

  it("never sends a video above 50 MB", () => {
    const job: Job = {
      ...baseJob,
      payload: {
        ...baseJob.payload,
        media: { kind: "video", url: "https://example.com/v.mp4", sizeBytes: 51 * 1024 * 1024, isPublic: true },
      },
    };
    const plan = planMessage(job);
    assert.equal(plan.sendFile, false);
    assert.equal(plan.reason, "media_too_large");
  });

  it("puts every button on its own row", () => {
    const keyboard = buildKeyboard(baseJob);
    assert.equal(keyboard.length, 2);
    assert.equal(keyboard[0]?.[0]?.text, "🌐 Mở Website");
    assert.equal(keyboard[1]?.[0]?.url, "https://example.com/tg/stop");
  });
});

describe("The rate limiter", () => {
  it("keeps the tasks apart in time", async () => {
    const limiter = new RateLimiter(50);
    const start = Date.now();
    await limiter.run(async () => undefined);
    await limiter.run(async () => undefined);
    assert.ok(Date.now() - start >= 15);
  });

  it("keeps running after a task fails", async () => {
    const limiter = new RateLimiter(1000);
    await assert.rejects(
      limiter.run(async () => {
        throw new Error("lỗi");
      }),
    );
    assert.equal(await limiter.run(async () => 42), 42);
  });
});
