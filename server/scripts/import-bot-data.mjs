// Chuyển dữ liệu bot từ hệ thống cũ (telegram-bot-dashboard, Flask/SQLite) sang web mới.
//
// Dùng:
//   OLD_BASE=https://web-cu.domain  OLD_USER=... OLD_PASS=... \
//   NEW_BASE=http://127.0.0.1:8090 NEW_USER=admin NEW_PASS=... \
//   node server/scripts/import-bot-data.mjs [--dry-run] [--no-sync]
//
// Cờ:
//   --dry-run : chỉ đọc + in ra, KHÔNG ghi gì vào web mới.
//   --no-sync : không báo cho dịch vụ bot mở kết nối (chỉ lưu vào CSDL).
//
// API của web cũ dùng (tất cả cần đăng nhập owner):
//   GET  /bots/health                    -> trạng thái + bộ đếm từng bot
//   GET  /bots/<id>/token                -> token đầy đủ của 1 bot
//   GET  /bots/<id>/subscribers          -> id đã bấm /start bot đó (có phân trang)
//   GET  /ids?page=&per_page=            -> danh sách id + trạng thái
//   GET  /reply_menu                     -> bàn phím trả lời dùng chung
//   GET  /settings/time (POST)           -> lịch gửi
//
// Lịch sử gửi (delivery_log / broadcast_logs) KHÔNG chuyển — chủ dự án chọn
// "bắt đầu mới" (2026-11-25).

const OLD_BASE = (process.env.OLD_BASE ?? "").replace(/\/+$/, "");
const OLD_USER = process.env.OLD_USER ?? "";
const OLD_PASS = process.env.OLD_PASS ?? "";
const NEW_BASE = (process.env.NEW_BASE ?? "http://127.0.0.1:8090").replace(/\/+$/, "");
const NEW_USER = process.env.NEW_USER ?? "admin";
const NEW_PASS = process.env.NEW_PASS ?? "";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const NO_SYNC = args.has("--no-sync");

if (!OLD_BASE || !OLD_USER || !OLD_PASS) {
  console.error("Thiếu OLD_BASE / OLD_USER / OLD_PASS.");
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * Client for the old web app (Flask + session cookie + CSRF)
 * ------------------------------------------------------------------ */

class OldClient {
  constructor() {
    this.jar = new Map();
  }

  cookie() {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  absorb(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      if (i > 0) this.jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }

  async request(method, path, body, extraHeaders = {}) {
    const headers = { cookie: this.cookie(), ...extraHeaders };
    let payload;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${OLD_BASE}${path}`, { method, headers, body: payload, redirect: "manual" });
    this.absorb(res);
    const text = await res.text();
    if (res.status >= 400) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async login() {
    const html = await (await fetch(`${OLD_BASE}/login`)).text();
    this.absorb({ headers: { getSetCookie: () => [] } });
    const csrf = /name="csrf_token" value="([^"]+)"/.exec(html)?.[1] ?? "";
    const res = await fetch(`${OLD_BASE}/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: this.cookie(),
        referer: `${OLD_BASE}/login`,
      },
      body: new URLSearchParams({ username: OLD_USER, password: OLD_PASS, csrf_token: csrf }),
    });
    this.absorb(res);
    if (res.status >= 400 && res.status !== 302) throw new Error(`Đăng nhập web cũ thất bại (HTTP ${res.status}).`);
    console.log("đã đăng nhập web cũ");
  }
}

/* ------------------------------------------------------------------ *
 * Client for the new web app
 * ------------------------------------------------------------------ */

const newJar = new Map();

function newCookie() {
  return [...newJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function absorbNew(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (i > 0) newJar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

async function newRequest(method, path, body) {
  const headers = { cookie: newCookie(), "x-requested-with": "ctc" };
  let payload;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${NEW_BASE}${path}`, { method, headers, body: payload });
  absorbNew(res);
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function loginNew() {
  await newRequest("POST", "/api/auth/login", { username: NEW_USER, password: NEW_PASS });
  console.log("đã đăng nhập web mới");
}

/* ------------------------------------------------------------------ *
 * 1. Read the old data
 * ------------------------------------------------------------------ */

const old = new OldClient();
await old.login();

// 1a. The bots with their health and the counters.
const health = await old.request("GET", "/bots/health");
if (!Array.isArray(health)) throw new Error("/bots/health trả về dữ liệu lạ.");
console.log(`web cũ: ${health.length} bot`);

// 1b. The token of every bot (owner only).
const bots = [];
for (const bot of health) {
  let token = "";
  try {
    const r = await old.request("GET", `/bots/${encodeURIComponent(bot.id)}/token`);
    token = (r?.token ?? "").trim();
  } catch {
    console.log(`  ! không lấy được token của bot ${bot.id}`);
  }
  bots.push({
    oldId: String(bot.id),
    name: bot.id,
    username: bot.username ?? null,
    token,
    status: bot.status === "LIVE" ? "live" : bot.status === "BAN" ? "ban" : bot.status === "ERROR" ? "error" : "unknown",
    autoResponder: bot.auto_responder !== false,
    weight: 1,
    startsCount: bot.starts_count ?? 0,
    messagesSent: bot.messages_sent ?? 0,
    interactionsCount: bot.interactions_count ?? 0,
    repliesCount: bot.replies_count ?? 0,
  });
  console.log(`  - ${bot.id}: ${bot.status}${token ? "" : " (KHÔNG có token)"}`);
}

// 1c. The people who pressed /start on a bot.
const startedBy = {};
for (const bot of bots) {
  const ids = [];
  let page = 1;
  for (;;) {
    const r = await old.request("GET", `/bots/${encodeURIComponent(bot.oldId)}/subscribers?page=${page}&per_page=5000`);
    const list = (r?.ids ?? []).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
    ids.push(...list);
    if (!r?.has_more) break;
    page++;
    if (page > 500) break;
  }
  if (ids.length) {
    startedBy[bot.oldId] = ids;
    console.log(`  - ${bot.oldId}: ${ids.length} người đã /start`);
  }
}

// 1d. The imported id list with its status.
const ids = [];
{
  let page = 1;
  for (;;) {
    const r = await old.request("GET", `/ids?page=${page}&per_page=200`);
    for (const row of r?.items ?? []) {
      const telegramId = Number(row.user_id);
      if (!Number.isFinite(telegramId) || telegramId <= 0) continue;
      ids.push({
        telegramId,
        status: ["unknown", "active", "blocked", "invalid"].includes(row.status) ? row.status : "unknown",
        username: null,
        firstName: null,
        ageVerified: false,
        captchaOk: false,
        bots: [],
      });
    }
    if (!r?.items?.length || page >= (r?.total ?? 0) / (r?.per_page ?? 200) + 1) break;
    page++;
    if (page > 5000) break;
  }
}
console.log(`  - danh sách id: ${ids.length}`);

// 1e. Mark who pressed /start on which bot.
for (const [botId, list] of Object.entries(startedBy)) {
  for (const telegramId of list) {
    const row = ids.find((r) => r.telegramId === telegramId);
    if (row) row.bots.push(botId);
  }
}

// 1f. The reply keyboard (shared by every bot).
let keyboard = null;
try {
  const r = await old.request("GET", "/reply_menu");
  keyboard = r?.menu ?? null;
  console.log(`  - bàn phím trả lời: ${keyboard ? "có" : "không có"}`);
} catch {
  console.log("  - không đọc được bàn phím trả lời");
}

/* ------------------------------------------------------------------ *
 * 2. Write to the new web app
 * ------------------------------------------------------------------ */

if (DRY_RUN) {
  console.log("\n=== DRY RUN — chưa ghi gì ===");
  console.log(`bot: ${bots.length} (có token: ${bots.filter((b) => b.token).length})`);
  console.log(`id: ${ids.length}`);
  console.log(`đã /start: ${Object.values(startedBy).reduce((s, l) => s + l.length, 0)}`);
  console.log("bàn phím:", JSON.stringify(keyboard)?.slice(0, 300));
  process.exit(0);
}

await loginNew();

const payload = {
  bots: bots.map((b) => ({ ...b, weight: 1 })),
  startedBy,
  ids,
};

const result = await newRequest("POST", "/api/admin/telegram/bots/import", payload);
console.log("\n=== kết quả ===");
console.log(`nhập bot thành công: ${result.imported.length}`);
for (const id of result.imported) console.log(`  + ${id}`);
if (result.failed.length) {
  console.log(`không nhập được (token chết): ${result.failed.length}`);
  for (const f of result.failed) console.log(`  - ${f.oldId}: ${f.reason}`);
}
if (result.skipped.length) console.log(`bỏ qua (đã có): ${result.skipped.join(", ")}`);
console.log(`id: ${result.idsImported}, liên kết đã /start: ${result.linksImported}`);
console.log(`đồng bộ sang dịch vụ bot: ${result.synced}/${result.imported.length}`);
if (NO_SYNC) console.log("(--no-sync: bỏ qua bước đồng bộ)");

// The reply keyboard of the old system.
if (keyboard && typeof keyboard === "object") {
  try {
    const rows = Array.isArray(keyboard.rows) ? keyboard.rows : [];
    const cells = rows.flat().filter((c) => c && (c.label ?? c.text));
    if (cells.length) {
      const mapped = cells.map((c) => ({
        label: String(c.label ?? c.text ?? "").slice(0, 64),
        type: c.url ? "url" : c.webapp ? "webapp" : "text",
        body: c.body ? String(c.body).slice(0, 1000) : undefined,
        url: c.url ? String(c.url).slice(0, 500) : undefined,
      }));
      await newRequest("PUT", "/api/admin/telegram/settings/keyboard", {
        enabled: keyboard.enabled !== false,
        prompt: String(keyboard.prompt ?? "").slice(0, 500),
        rows: [mapped],
      });
      console.log(`đã chuyển bàn phím trả lời (${mapped.length} nút)`);
    }
  } catch (err) {
    console.log(`! không chuyển được bàn phím: ${err.message}`);
  }
}

console.log("\nXong. Lịch sử gửi (delivery_log) KHÔNG chuyển — bắt đầu mới theo yêu cầu.");
