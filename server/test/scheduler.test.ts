import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

const uploadDir = mkdtempSync(path.join(os.tmpdir(), "ctc-sched-test-"));
process.env.DATABASE_URL = "pglite:memory";
process.env.UPLOAD_DIR = uploadDir;
process.env.PUBLIC_DIR = path.join(uploadDir, "no-frontend");
process.env.ADMIN_USERNAME = "boss";
process.env.ADMIN_PASSWORD = "boss-password";
process.env.BOT_API_SECRET = "test-bot-secret";

const { initDb, closeDb } = await import("../src/db/index.js");
const { buildApp } = await import("../src/app.js");
const { seed } = await import("../src/seed.js");
const { eq } = await import("drizzle-orm");
const schema = await import("../src/db/schema.js");
const { telegramBots, telegramCampaigns, telegramUsers, telegramLinks, deliveryLog, notificationJobs } = schema;
const { mayReceive, queueCampaign, nextAllowedTime, vietnamNow, contentHashOf } = await import("../src/scheduler.js");

type App = Awaited<ReturnType<typeof buildApp>>;
let app: App;
/** The db handle is assigned by initDb, so it can only be read after that. */
let db: Awaited<typeof import("../src/db/index.js")>["db"];

const H = { "x-requested-with": "ctc" };
const BOT = { "x-bot-secret": "test-bot-secret" };

function cookieOf(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.map((c: string) => c.split(";")[0]).join("; ");
}

/** Signs in as the admin and returns the session cookie for admin routes. */
async function loginAdmin(): Promise<string> {
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: H,
    payload: { username: "boss", password: "boss-password" },
  });
  assert.equal(login.statusCode, 200, login.body);
  return cookieOf(login);
}

before(async () => {
  await initDb("pglite:memory");
  db = (await import("../src/db/index.js")).db;
  await seed();
  app = await buildApp({ logger: false });
  await app.ready();

  // One live bot so the scheduler can create jobs.
  await db.insert(telegramBots).values({ id: "bot-a", username: "ctc_bot_a", status: "live", weight: 1 });
});

after(async () => {
  await app?.close();
  await closeDb();
  rmSync(uploadDir, { recursive: true, force: true });
});

describe("Telegram scheduler and frequency limits", () => {
  it("converts the Vietnam time correctly", () => {
    // 2026-01-01T00:00:00Z is 07:00 on 2026-01-01 in Vietnam.
    const vn = vietnamNow(new Date("2026-01-01T00:00:00Z"));
    assert.equal(vn.hour, 7);
    assert.equal(vn.day, 1);
  });

  it("moves a message sent outside 08:00-22:00 to the next morning", () => {
    // 23:00 Vietnam => must be delayed until 08:00 the next day.
    const late = new Date("2026-01-01T16:00:00Z"); // 23:00 VN
    const next = nextAllowedTime(late);
    const vn = vietnamNow(next);
    assert.equal(vn.hour, 8);
    assert.equal(vn.day, 2);
  });

  it("keeps a message sent inside the window where it is", () => {
    const inside = new Date("2026-01-01T05:00:00Z"); // 12:00 VN
    const next = nextAllowedTime(inside);
    assert.equal(next.getTime(), inside.getTime());
  });

  it("creates jobs for a campaign and marks them as delivered only once", async () => {
    // Admin routes need a signed-in admin session.
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: H,
      payload: { username: "boss", password: "boss-password" },
    });
    assert.equal(login.statusCode, 200, login.body);
    const adminCookie = cookieOf(login);

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/telegram/campaigns",
      headers: { ...H, cookie: adminCookie },
      payload: {
        name: "Chiến dịch kiểm thử",
        text: "Nội dung kiểm thử",
        targetType: "all_linked",
        schedule: "now",
      },
    });
    assert.equal(res.statusCode, 200, res.body);
    const { campaign } = res.json();

    // No linked account yet -> nothing to queue.
    const result = await queueCampaign(campaign.id, new Date());
    assert.equal(result.queued, 0);

    // Create a linked Telegram person.
    await db.insert(telegramUsers).values({ telegramId: 500001, status: "active" });
    const [tg] = await db.select().from(telegramUsers).where(eq(telegramUsers.telegramId, 500001));
    await db.insert(telegramLinks).values({
      telegramId: tg.id,
      userId: 1,
      method: "code",
      lastSeenAt: new Date(),
    });

    const result2 = await queueCampaign(campaign.id, new Date());
    assert.equal(result2.queued, 1, JSON.stringify(result2));

    const jobs = await db.select().from(notificationJobs);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].status, "queued");
    const payload = jobs[0].payload as { buttons: { label: string }[]; webUrl: string };
    assert.ok(payload.buttons.some((b) => b.label.includes("Từ chối")));
    assert.ok(payload.webUrl.includes("cid="));

    // Sending the same campaign again must not create a second job.
    const result3 = await queueCampaign(campaign.id, new Date());
    assert.equal(result3.queued, 0);
    assert.equal(result3.skipped, 1);
  });

  it("refuses a second message to the same person within a day", async () => {
    // Pretend the person already received one message today.
    await db.insert(deliveryLog).values({
      campaignId: "campaign-truoc",
      telegramId: 500001,
      botId: "bot-a",
      status: "sent",
      sentAt: new Date(),
      error: null,
    });
    const hash = contentHashOf("Nội dung khác");
    const check = await mayReceive(500001, "campaign-khac", hash);
    assert.equal(check.ok, false);
    // The reason must be a frequency limit, not an unknown user.
    assert.ok(["daily_limit", "same_content_recently", "too_soon"].includes(check.reason ?? ""));
  });

  it("lets a person who opted out receive nothing", async () => {
    await db.update(telegramUsers).set({ optOut: true }).where(eq(telegramUsers.telegramId, 500001));
    const check = await mayReceive(500001, "campaign-x", contentHashOf("khác nữa"));
    assert.equal(check.ok, false);
    assert.equal(check.reason, "opted_out");
  });

  it("hands a job to the bot exactly once", async () => {
    const first = await app.inject({ method: "GET", url: "/api/bot/jobs?limit=50", headers: BOT });
    assert.equal(first.statusCode, 200, first.body);
    const jobs = first.json().jobs;
    assert.ok(jobs.length >= 1);

    const second = await app.inject({ method: "GET", url: "/api/bot/jobs?limit=50", headers: BOT });
    const again = second.json().jobs.filter((j: { jobId: number }) => jobs.some((x: { jobId: number }) => x.jobId === j.jobId));
    assert.equal(again.length, 0);
  });

  it("records the result and blocks further delivery", async () => {
    const jobs = await db.select().from(notificationJobs);
    const job = jobs[0];
    const res = await app.inject({
      method: "POST",
      url: "/api/bot/result",
      headers: BOT,
      payload: { jobId: job.id, status: "sent", botId: "bot-a" },
    });
    assert.equal(res.statusCode, 200, res.body);

    const log = await db.select().from(deliveryLog);
    assert.ok(log.length >= 1);
    const [updated] = await db.select().from(notificationJobs).where(eq(notificationJobs.id, job.id));
    assert.equal(updated.status, "sent");
  });

  it("never sends twice for the same campaign and person", async () => {
    const jobs = await db.select().from(notificationJobs);
    const maxId = Math.max(...jobs.map((j) => j.id));
    const res = await app.inject({
      method: "POST",
      url: "/api/bot/result",
      headers: BOT,
      payload: { jobId: maxId + 9999, status: "sent" },
    });
    assert.equal(res.statusCode, 404);
  });

  it("sends an emergency campaign to the imported ids even when the daily limit is reached", async () => {
    // The person received a message today, so the normal rules would block it.
    await db.update(telegramUsers).set({ optOut: false, notifyEnabled: true }).where(eq(telegramUsers.telegramId, 500001));
    await db.insert(deliveryLog).values({
      campaignId: "campaign-hom-truoc",
      telegramId: 500001,
      botId: "bot-a",
      status: "sent",
      sentAt: new Date(),
      error: null,
    });

    const adminCookie = await loginAdmin();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/telegram/campaigns",
      headers: { ...H, cookie: adminCookie },
      payload: {
        name: "Khẩn cấp",
        text: "Nội dung khẩn cấp",
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

    // The emergency campaign goes through anyway.
    const queued = await queueCampaign(campaign.id, new Date());
    assert.equal(queued.queued, 1, JSON.stringify(queued));
    assert.equal(queued.skipped, 0, JSON.stringify(queued));
  });

  it("narrows the imported ids down to the chosen status group", async () => {
    // One person that is not active.
    await db.insert(telegramUsers).values({ telegramId: 500002, status: "invalid" });

    const adminCookie = await loginAdmin();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/telegram/campaigns",
      headers: { ...H, cookie: adminCookie },
      payload: {
        name: "Chỉ nhóm active",
        text: "Nội dung riêng cho nhóm active",
        mediaType: "none",
        targetType: "imported",
        targetIds: ["active"],
        isEmergency: true,
        schedule: "now",
      },
    });
    assert.equal(res.statusCode, 200, res.body);
    const { campaign } = res.json();

    const queued = await queueCampaign(campaign.id, new Date());
    // Only the active person is targeted — the invalid one is left out.
    assert.equal(queued.queued, 1, JSON.stringify(queued));

    const jobs = await db.select().from(notificationJobs).where(eq(notificationJobs.campaignId, campaign.id));
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].telegramId, 500001);
  });

  it("queues a big list of recipients in small batches", async () => {
    // More ids than one INSERT can take — the rows go in in batches so the
    // SQL builder does not run out of stack (B101).
    const many = Array.from({ length: 1200 }, (_, i) => ({ telegramId: 700000 + i, status: "active" }));
    for (const row of many) await db.insert(telegramUsers).values(row);

    const adminCookie = await loginAdmin();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/telegram/campaigns",
      headers: { ...H, cookie: adminCookie },
      payload: {
        name: "Chiến dịch đông",
        text: "Nội dung tới nhiều người",
        mediaType: "none",
        targetType: "imported",
        targetIds: ["active"],
        isEmergency: true,
        schedule: "now",
      },
    });
    assert.equal(res.statusCode, 200, res.body);
    const { campaign } = res.json();

    const queued = await queueCampaign(campaign.id, new Date());
    assert.equal(queued.queued, 1201, JSON.stringify(queued));

    const jobs = await db.select().from(notificationJobs).where(eq(notificationJobs.campaignId, campaign.id));
    assert.equal(jobs.length, 1201);
  });

  it("leaves out the ids Telegram already refused", async () => {
    // Telegram said these ids are gone or blocked — a new message would
    // only be wasted (B106).
    await db.insert(telegramUsers).values({ telegramId: 800001, status: "invalid" });
    await db.insert(telegramUsers).values({ telegramId: 800002, status: "blocked" });
    await db.insert(telegramUsers).values({ telegramId: 800003, status: "active" });

    const adminCookie = await loginAdmin();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/telegram/campaigns",
      headers: { ...H, cookie: adminCookie },
      payload: {
        name: "Chiến dịch bỏ id chết",
        text: "Chỉ gửi cho người còn dùng được",
        mediaType: "none",
        targetType: "imported",
        targetIds: [],
        isEmergency: true,
        schedule: "now",
      },
    });
    assert.equal(res.statusCode, 200, res.body);
    const { campaign } = res.json();

    const queued = await queueCampaign(campaign.id, new Date());
    assert.ok((queued.skippedReasons.unusable_id ?? 0) >= 2, JSON.stringify(queued));

    const jobs = await db.select().from(notificationJobs).where(eq(notificationJobs.campaignId, campaign.id));
    const ids = jobs.map((j) => j.telegramId);
    assert.ok(!ids.includes(800001), "Id không hợp lệ không được gửi.");
    assert.ok(!ids.includes(800002), "Id đã bị chặn không được gửi.");
    assert.ok(ids.includes(800003), "Id còn dùng được vẫn phải được gửi.");
  });
});
