import zlib from "node:zlib";

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
    // The login page hands out a session cookie and the CSRF token. Both are
    // needed for the POST, otherwise Flask answers 400.
    const res = await fetch(`${OLD_BASE}/login`, { redirect: "manual" });
    this.absorb(res);
    const html = await res.text();
    const csrf = /name="csrf_token" value="([^"]+)"/.exec(html)?.[1] ?? "";
    if (!csrf) throw new Error("Không tìm thấy csrf_token trong trang đăng nhập của web cũ.");
    const post = await fetch(`${OLD_BASE}/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: this.cookie(),
        referer: `${OLD_BASE}/login`,
        origin: OLD_BASE,
        "x-requested-with": "XMLHttpRequest",
      },
      body: new URLSearchParams({ username: OLD_USER, password: OLD_PASS, csrf_token: csrf }),
    });
    this.absorb(post);
    if (post.status >= 400) {
      const text = await post.text();
      throw new Error(`Đăng nhập web cũ thất bại (HTTP ${post.status}): ${text.slice(0, 200)}`);
    }
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

/**
 * The backup zip of the old web app.
 *
 * It holds `bots.json` (the tokens), `subs_<bot>.json` (the people who
 * pressed /start) and `banned.json`. One download instead of hundreds of
 * requests — the old web app answers 200 ids per page, and there are 61092
 * of them.
 */
async function readBackup() {
  const res = await fetch(`${OLD_BASE}/backup/download`, { headers: { cookie: old.cookie() }, redirect: "manual" });
  if (!res.ok) throw new Error(`Tải backup thất bại (HTTP ${res.status}).`);
  const buffer = Buffer.from(await res.arrayBuffer());
  // Node has no built-in zip reader, so the entries are pulled out by hand:
  // every local file header carries the name, the method and the size.
  const files = new Map();
  let offset = 0;
  while (offset < buffer.length - 4) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString("utf8", offset + 30, offset + 30 + nameLen);
    const start = offset + 30 + nameLen + extraLen;
    const raw = buffer.subarray(start, start + compressedSize);
    if (method === 0) {
      files.set(name, raw);
    } else if (method === 8) {
      // The zip was written with deflate — Node can inflate it.
      try {
        files.set(name, zlib.inflateRawSync(raw));
      } catch {
        console.log(`  ! không giải nén được ${name}`);
      }
    }
    offset = start + compressedSize;
  }
  console.log(`backup: ${files.size} file`);
  return files;
}

const backup = await readBackup();

/** Read one json file out of the backup. */
function backupJson(name, fallback = null) {
  const raw = backup.get(name);
  if (!raw) return fallback;
  try {
    // The zip stores the entries without compression, so the bytes are json.
    return JSON.parse(raw.toString("utf8"));
  } catch {
    return fallback;
  }
}

/* ---- 1a. the bots: token, name, health and the counters ---- */
const health = await old.request("GET", "/bots/health");
if (!Array.isArray(health)) throw new Error("/bots/health trả về dữ liệu lạ.");
const botConfigs = backupJson("bots.json", []);
const configById = new Map(botConfigs.map((b) => [String(b.id), b]));
const healthById = new Map(health.map((h) => [String(h.id), h]));
// The backup holds every bot, the health endpoint only the ones it could
// answer for. The backup is the master list.
const allBotIds = [...new Set([...configById.keys(), ...healthById.keys()])];
console.log(`web cũ: ${allBotIds.length} bot (${botConfigs.length} trong backup, ${health.length} trong health)`);

const bots = [];
for (const oldId of allBotIds) {
  const cfg = configById.get(oldId);
  const bot = healthById.get(oldId);
  // The token comes from the backup; the API is the fallback.
  let token = String(cfg?.token ?? "").trim();
  if (!token && bot) {
    try {
      const r = await old.request("GET", `/bots/${encodeURIComponent(oldId)}/token`);
      token = String(r?.token ?? "").trim();
    } catch {
      console.log(`  ! không lấy được token của bot ${oldId}`);
    }
  }
  bots.push({
    oldId,
    name: cfg?.name || oldId,
    // The username is not in the backup, but the old system stored it in the
    // bot list of the admin panel.
    username: cfg?.username ?? null,
    token,
    // A bot the health endpoint does not know about is treated as banned —
    // Telegram refuses its token, so it cannot be used any more.
    status: !bot
      ? "ban"
      : bot.status === "LIVE"
        ? "live"
        : bot.status === "BAN"
          ? "ban"
          : bot.status === "ERROR"
            ? "error"
            : "unknown",
    autoResponder: cfg?.auto_responder ?? bot?.auto_responder ?? true,
    weight: 1,
    startsCount: bot?.starts_count ?? 0,
    messagesSent: bot?.messages_sent ?? 0,
    interactionsCount: bot?.interactions_count ?? 0,
    repliesCount: bot?.replies_count ?? 0,
  });
}
const alive = bots.filter((b) => b.status === "live").length;
const banned = bots.filter((b) => b.status === "ban").length;
console.log(`  - ${alive} còn sống, ${banned} bị ban, ${bots.filter((b) => !b.token).length} không có token`);

/* ---- 1b. the people who pressed /start on a bot ---- */
const startedBy = {};
for (const bot of bots) {
  const fromBackup = backupJson(`subs_${bot.oldId}.json`, null);
  let ids;
  if (Array.isArray(fromBackup)) {
    ids = fromBackup.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
  } else {
    // No file for this bot: ask the API (paginated).
    ids = [];
    let page = 1;
    for (;;) {
      const r = await old.request("GET", `/bots/${encodeURIComponent(bot.oldId)}/subscribers?page=${page}&per_page=5000`);
      const list = (r?.ids ?? []).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
      ids.push(...list);
      if (!r?.has_more) break;
      page++;
      if (page > 500) break;
    }
  }
  if (ids.length) {
    startedBy[bot.oldId] = ids;
  }
}
console.log(`  - ${Object.keys(startedBy).length} bot có người đã /start (${Object.values(startedBy).reduce((s, l) => s + l.length, 0)} lượt)`);

/* ---- 1c. the banned list of the old web app ---- */
const bannedList = (backupJson("banned.json", []) ?? []).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
console.log(`  - danh sách bị cấm: ${bannedList.length}`);

/* ---- 1d. the imported id list with its status ---- */
// The old web app hard-limits the page to 200 ids, so 61092 ids need 306
// requests. They are fetched in batches of 8 pages at a time.
const ids = [];
{
  const bannedSet = new Set(bannedList);
  const first = await old.request("GET", "/ids?page=1&per_page=200");
  const total = Number(first?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / 200));

  const toRow = (row) => {
    const telegramId = Number(row.user_id);
    if (!Number.isFinite(telegramId) || telegramId <= 0) return null;
    // The banned list wins over the status of the id list.
    const status = bannedSet.has(telegramId)
      ? "blocked"
      : ["unknown", "active", "blocked", "invalid"].includes(row.status)
        ? row.status
        : "unknown";
    return {
      telegramId,
      status,
      username: null,
      firstName: null,
      ageVerified: false,
      captchaOk: false,
      bots: [],
    };
  };

  for (const row of first?.items ?? []) {
    const entry = toRow(row);
    if (entry) ids.push(entry);
  }

  const CONCURRENCY = 8;
  let next = 2;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const page = next++;
      if (page > pages) return;
      try {
        const r = await old.request("GET", `/ids?page=${page}&per_page=200`);
        for (const row of r?.items ?? []) {
          const entry = toRow(row);
          if (entry) ids.push(entry);
        }
      } catch (err) {
        console.log(`  ! trang ${page} lỗi: ${err.message}`);
      }
    }
  });
  await Promise.all(workers);
  console.log(`  - danh sách id: ${ids.length} / ${total}`);
}

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

/* ---- the bots: one call, they are small ---- */
const botResult = await newRequest("POST", "/api/admin/telegram/bots/import", {
  bots: bots.map((b) => ({ ...b, weight: 1 })),
});
console.log("\n=== kết quả: bot ===");
console.log(`nhập bot thành công: ${botResult.imported.length}`);
for (const id of botResult.imported) console.log(`  + ${id}`);
if (botResult.failed.length) {
  console.log(`không nhập được (token chết): ${botResult.failed.length}`);
  for (const f of botResult.failed) console.log(`  - ${f.oldId}: ${f.reason}`);
}
if (botResult.skipped.length) console.log(`bỏ qua (đã có): ${botResult.skipped.join(", ")}`);
console.log(`đồng bộ sang dịch vụ bot: ${botResult.synced}/${botResult.imported.length}`);
if (NO_SYNC) console.log("(--no-sync: bỏ qua bước đồng bộ)");

/* ---- the id list: split into batches, the body limit is 15 MB ---- */
const ID_BATCH = 3000;
let idsImported = 0;
let linksImported = 0;
for (let i = 0; i < ids.length; i += ID_BATCH) {
  const batch = ids.slice(i, i + ID_BATCH);
  // The people who pressed /start belong to this batch of ids.
  const batchIds = new Set(batch.map((r) => r.telegramId));
  const batchStartedBy = {};
  for (const [botId, list] of Object.entries(startedBy)) {
    const inBatch = list.filter((tid) => batchIds.has(tid));
    if (inBatch.length) batchStartedBy[botId] = inBatch;
  }
  const res = await newRequest("POST", "/api/admin/telegram/bots/import", {
    bots: [],
    ids: batch,
    startedBy: batchStartedBy,
  });
  idsImported += res.idsImported;
  linksImported += res.linksImported;
  console.log(`  lô ${Math.floor(i / ID_BATCH) + 1}: id ${res.idsImported}, liên kết ${res.linksImported}`);
}
console.log(`\n=== kết quả: id ===`);
console.log(`id: ${idsImported}, liên kết đã /start: ${linksImported}`);

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
