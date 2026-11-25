// Import TOÀN BỘ bài viết từ web cũ (telegram-bot-dashboard) sang web mới.
//
// Mỗi POST của album cũ là MỘT bài viết độc lập trên web mới:
//   tiêu đề = dòng đầu caption, nội dung = caption đầy đủ, media = ảnh/video của post.
//
// Dùng (import tất cả):
//   OLD_BASE=... OLD_USER=... OLD_PASS=... \
//   NEW_BASE=http://127.0.0.1:8090 NEW_USER=admin NEW_PASS=... \
//   node server/scripts/import-all-from-old-web.mjs
//
// Dùng (import 1 album):
//   node server/scripts/import-all-from-old-web.mjs --album album_xxxx
//
// Cờ:
//   --limit N     : chỉ tạo N bài viết đầu tiên (mỗi post cũ = 1 bài viết)
//   --replace     : xoá bài cũ trùng tiêu đề trước khi tạo
//   --keep-links  : giữ nguyên link trong nội dung (mặc định tách link anonlink.io ->
//                   nút "Xem ngay" và link t.me -> nút "Kênh VIP", xoá đoạn quảng cáo)
//   --resume      : bỏ qua album đã xong (dựa trên file trạng thái .import-state.json)
//   --dry-run     : chỉ đọc, không ghi gì
//
// Trạng thái: file <src>/.import-state.json ghi lại album đã xong để chạy lại được.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const args = process.argv.slice(2);
const arg = (name, fallback = "") => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const OLD = process.env.OLD_BASE ?? "https://web-cu.domain";
const NEW = process.env.NEW_BASE ?? "http://127.0.0.1:8090";
const OLD_USER = process.env.OLD_USER ?? "";
const OLD_PASS = process.env.OLD_PASS ?? "";
const NEW_USER = process.env.NEW_USER ?? "admin";
const NEW_PASS = process.env.NEW_PASS ?? "";

const ALBUM_ID = arg("album");
const SRC = path.resolve(arg("src", "./import-tmp"));
const LIMIT = Number(arg("limit", "0")) || 0;
const DRY = has("dry-run");
const STATE_FILE = path.join(SRC, ".import-state.json");

// ── Tiện ích HTTP ────────────────────────────────────────────────────────────
function makeClient(base) {
  const jar = new Map();
  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const absorb = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  };
  return {
    cookieHeader,
    async request(method, url, body, headers = {}, allowRedirect = false) {
      const res = await fetch(`${base}${url}`, {
        method,
        headers: { cookie: cookieHeader(), ...headers },
        body,
        redirect: "manual",
      });
      absorb(res);
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* không phải JSON */ }
      const ok = res.ok || (allowRedirect && res.status >= 300 && res.status < 400);
      if (!ok) throw new Error(`${method} ${url} -> ${res.status} ${text.slice(0, 300)}`);
      return { json, text };
    },
  };
}

/**
 * Đăng nhập web cũ (Flask + CSRF).
 *
 * Phải giữ cookie phiên từ GET /login — không parse cookie từ HTML (B53).
 */
async function loginOld() {
  const c = makeClient(OLD);
  const { text } = await c.request("GET", "/login");
  const csrf = /name="csrf_token" value="([^"]+)"/.exec(text)?.[1];
  if (!csrf) throw new Error("không tìm thấy csrf_token ở web c��");
  await c.request("POST", "/login", new URLSearchParams({ username: OLD_USER, password: OLD_PASS, csrf_token: csrf }), {
    "content-type": "application/x-www-form-urlencoded",
    referer: `${OLD}/login`,
    origin: OLD,
  }, true);
  return c;
}

/** Danh sách album của web cũ (nằm trong <script id="rmAlbumsJson"> của trang /). */
async function listAlbums(client) {
  const { text } = await client.request("GET", "/");
  const m = /<script type="application\/json" id="rmAlbumsJson">([\s\S]*?)<\/script>/.exec(text);
  if (!m) throw new Error("không tìm thấy rmAlbumsJson ở trang chủ web cũ");
  const albums = JSON.parse(m[1]);
  return albums.map((a) => ({ id: a.id, title: a.title }));
}

/** Đọc album + tải media về SRC. */
async function fetchAlbum(client, albumId) {
  const { text } = await client.request("GET", `/albums/${albumId}/posts/edit`);
  const title = /name="album_title"[^>]*value="([^"]*)"/.exec(text)?.[1] ?? "";
  const description = (/name="album_description"[^>]*>([\s\S]*?)<\/textarea>/.exec(text)?.[1] ?? "").trim();

  // Mỗi khối post-card chứa textarea caption_<post_id> và các link media.
  const posts = [];
  for (const card of text.split(/<div class="post-card">/).slice(1)) {
    const postId = /name="caption_([a-f0-9]{32})"/.exec(card)?.[1];
    if (!postId) continue;
    const caption = (/name="caption_[a-f0-9]{32}"[^>]*>([\s\S]*?)<\/textarea>/.exec(card)?.[1] ?? "").trim();
    const seen = new Set();
    const media = [];
    for (const m of card.matchAll(/\/static\/uploads\/(images|videos)\/([A-Za-z0-9._-]+)/g)) {
      if (seen.has(m[0])) continue;
      seen.add(m[0]);
      media.push({ type: m[1] === "images" ? "image" : "video", url: m[0], name: m[2] });
    }
    posts.push({ postId, caption, media });
  }
  return { albumId, title, description, posts };
}

/** Tải media của album về SRC (song song 8 file/lần). */
async function downloadMedia(client, posts) {
  const mediaDir = path.join(SRC, "media");
  fs.mkdirSync(mediaDir, { recursive: true });
  const jobs = [];
  for (const p of posts) {
    for (const m of p.media) {
      const dest = path.join(mediaDir, m.name);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) continue;
      jobs.push({ m, dest });
    }
  }
  if (!jobs.length) return 0;

  let done = 0;
  const CONCURRENCY = 8;
  let next = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const i = next++;
      if (i >= jobs.length) return;
      const { m, dest } = jobs[i];
      try {
        const res = await fetch(`${OLD}${m.url}`, { headers: { cookie: client.cookieHeader() } });
        if (!res.ok) {
          console.log(`  ! tải lỗi ${m.name} (${res.status})`);
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        // Ghi ra file tạm rồi đổi tên — tránh file dở dang nếu bị ngắt.
        const tmp = `${dest}.part`;
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, dest);
      } catch (err) {
        console.log(`  ! tải lỗi ${m.name}: ${err.message}`);
      }
      done++;
      if (done % 25 === 0) console.log(`    media ${done}/${jobs.length}`);
    }
  });
  await Promise.all(workers);
  return jobs.length;
}

/** ffprobe: duration/width/height. Trả null nếu máy không có ffprobe. */
async function probe(file) {
  try {
    const { stdout } = await execFileP("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height:format=duration", "-of", "json", file,
    ], { timeout: 120_000 });
    const data = JSON.parse(stdout);
    return {
      width: data.streams?.[0]?.width ?? 0,
      height: data.streams?.[0]?.height ?? 0,
      duration: Math.round(Number(data.format?.duration ?? 0)) || 0,
    };
  } catch {
    return null;
  }
}

// ── Nội dung / link ──────────────────────────────────────────────────────────
function titleFromCaption(caption) {
  const first = (caption ?? "").split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0) ?? "";
  return first.slice(0, 200) || "Bài viết";
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Tách link ra khỏi nội dung để giao diện hiển thị thành nút bấm:
 *   - link anonlink.io (mua/xem full video) -> watchLink
 *   - link kênh Telegram (t.me/...)       -> vipLink
 *   - đoạn "Link 1 ... ANH EM CHỌN ... Kênh VIP không cần vượt 👉 ..." bị xoá
 */
function extractLinks(caption, { keep = false } = {}) {
  const text = caption ?? "";
  if (keep) return { description: text, watchLink: null, vipLink: null };

  const urlRe = /https?:\/\/[^\s<>"']+/g;
  const all = text.match(urlRe) ?? [];
  const watchLink = all.find((u) => /anonlink\.io/i.test(u)) ?? null;
  const vipLink = all.find((u) => /t\.me\//i.test(u)) ?? null;

  let description = text;
  if (watchLink && vipLink) {
    const re = new RegExp(
      String.raw`(^|\n)[^\n]*${escapeRe(watchLink)}[^\n]*(\n[^\n]*)*?${escapeRe(vipLink)}[^\n]*(\n|$)?`,
      "i",
    );
    description = description.replace(re, "\n");
  } else if (watchLink) {
    description = description.replace(new RegExp(escapeRe(watchLink), "ig"), "");
  } else if (vipLink) {
    description = description.replace(new RegExp(escapeRe(vipLink), "ig"), "");
  }

  description = description
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .filter((l, i, arr) => !(l.trim() === "" && arr[i - 1]?.trim() === "" && (i === 0 || arr[i - 1].trim() === "")))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { description, watchLink, vipLink };
}

// ── Trạng thái ───────────────────────────────────────────────────────────────
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { done: [], failed: {} };
  }
}
function saveState(state) {
  fs.mkdirSync(SRC, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

// ── Chạy ────────────────────────────────────────────────────────────────────
const old = await loginOld();
console.log("đã đăng nhập web cũ");

const albums = ALBUM_ID ? [{ id: ALBUM_ID, title: "" }] : await listAlbums(old);
console.log(`web cũ: ${albums.length} album`);

const state = has("resume") ? loadState() : { done: [], failed: {} };
const doneSet = new Set(state.done);

if (DRY) {
  console.log("\n=== DRY RUN — chưa ghi gì ===");
  for (const a of albums.slice(0, 3)) {
    const album = await fetchAlbum(old, a.id);
    console.log(`  ${a.id} "${album.title}" => ${album.posts.length} post, ` +
      `${album.posts.reduce((s, p) => s + p.media.length, 0)} media`);
  }
  console.log(`tổng ${albums.length} album`);
  process.exit(0);
}

// Đăng nhập web mới (CSRF header "x-requested-with: ctc" — xem server/src/app.ts).
const nc = makeClient(NEW);
await nc.request("POST", "/api/auth/login", JSON.stringify({ username: NEW_USER, password: NEW_PASS }), {
  "content-type": "application/json",
  "x-requested-with": "ctc",
});
// Header bí mật để không bị rate limit chặn khi import hàng nghìn bài.
// Máy chủ chỉ chấp nhận khi IMPORT_SECRET khớp (xem server/src/importSecret.ts).
const IMPORT_HEADER = "x-import-secret";
const IMPORT_SECRET = process.env.IMPORT_SECRET ?? "";
const importHeaders = IMPORT_SECRET ? { [IMPORT_HEADER]: IMPORT_SECRET } : {};
const api = (method, url, body, headers = {}) =>
  nc.request(method, url, body, { "x-requested-with": "ctc", ...importHeaders, ...headers }).then((r) => r.json);

const cats = await api("GET", "/api/admin/categories");
const categoryId = (cats?.categories ?? [])[0]?.id ?? null;

// Bảng tra tiêu đề -> id, để --replace xoá đúng bài cũ.
const existing = new Map();
if (has("replace")) {
  const list = await api("GET", "/api/articles?limit=1000");
  for (const a of list?.articles ?? []) existing.set(String(a.title ?? ""), a.id);
}

let imgOk = 0;
let vidOk = 0;
let articles = 0;
const started = Date.now();

for (const [index, a] of albums.entries()) {
  if (doneSet.has(a.id)) {
    console.log(`[${index + 1}/${albums.length}] ${a.id} — đã xong, bỏ qua`);
    continue;
  }
  try {
    const album = await fetchAlbum(old, a.id);
    const posts = LIMIT > 0 ? album.posts.slice(0, LIMIT) : album.posts;
    const nMedia = posts.reduce((s, p) => s + p.media.length, 0);

    await downloadMedia(old, posts);

    if (has("replace")) {
      for (const p of posts) {
        const t = titleFromCaption(p.caption);
        const oldId = existing.get(t);
        if (oldId) {
          await api("DELETE", `/api/admin/articles/${oldId}`);
          existing.delete(t);
          console.log(`  đã xoá bài cũ id=${oldId} "${t.slice(0, 60)}"`);
        }
      }
    }

    for (const [pi, p] of posts.entries()) {
      const title = titleFromCaption(p.caption);
      const { description, watchLink, vipLink } = extractLinks(p.caption, { keep: has("keep-links") });
      const res = await api("POST", "/api/admin/articles", JSON.stringify({
        title,
        description,
        watchLink,
        vipLink,
        categoryId,
        tags: "",
        visibility: "public",
        isHot: false,
      }), { "content-type": "application/json" });
      const articleId = res.article.id;
      articles++;

      for (const m of p.media) {
        const file = path.join(SRC, "media", m.name);
        if (!fs.existsSync(file)) {
          console.log(`  thiếu file ${m.name}`);
          continue;
        }
        const buf = fs.readFileSync(file);
        if (m.type === "image") {
          const form = new FormData();
          form.append("file", new Blob([buf]), m.name);
          await nc.request("POST", `/api/admin/articles/${articleId}/images`, form, { "x-requested-with": "ctc", ...importHeaders });
          imgOk++;
        } else {
          const meta = await probe(file);
          const form = new FormData();
          form.append("video", new Blob([buf]), m.name);
          if (meta) {
            form.append("duration", String(meta.duration));
            form.append("width", String(meta.width));
            form.append("height", String(meta.height));
          }
          await nc.request("POST", `/api/admin/articles/${articleId}/videos`, form, { "x-requested-with": "ctc", ...importHeaders });
          vidOk++;
        }
      }
      if (pi % 5 === 0 || pi === posts.length - 1) {
        const min = ((Date.now() - started) / 60000).toFixed(1);
        console.log(`  [${pi + 1}/${posts.length}] bài #${articleId} "${title.slice(0, 60)}" media=${p.media.length}${watchLink ? " +xem ngay" : ""}${vipLink ? " +vip" : ""} (${min} phút)`);
      }
    }

    state.done.push(a.id);
    state.failed[a.id] = null;
    saveState(state);
    console.log(`[${index + 1}/${albums.length}] ${a.id} "${album.title}" xong: ${posts.length} bài, ${nMedia} media`);
  } catch (err) {
    state.failed[a.id] = String(err.message ?? err).slice(0, 300);
    saveState(state);
    console.log(`[${index + 1}/${albums.length}] ${a.id} LỖI: ${state.failed[a.id]}`);
  }
}

console.log(`\nxong: ${articles} bài viết, ảnh=${imgOk} video=${vidOk}, album=${state.done.length}/${albums.length}`);
