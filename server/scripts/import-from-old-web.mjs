// Import bài viết từ web cũ (telegram-bot-dashboard, Flask/SQLite) sang web mới.
//
// Mỗi POST của album cũ là MỘT bài viết độc lập trên web mới:
//   tiêu đề = dòng đầu caption, nội dung = caption đầy đủ, media = ảnh/video của post.
//
// Dùng:
//   OLD_BASE=https://web-cu.domain  NEW_BASE=http://127.0.0.1:8090 \
//   OLD_USER=... OLD_PASS=... NEW_USER=admin NEW_PASS=... \
//   node server/scripts/import-from-old-web.mjs --album album_xxxx --src ./tmp \
//     [--limit 5] [--replace]
//
// --limit N : chỉ tạo N bài viết đầu tiên. --replace: xoá bài cũ trùng tiêu đề.
// --keep-links: giữ nguyên link trong nội dung (mặc định tách link anonlink.io ->
//   nút "Xem ngay" và link t.me -> nút "Kênh VIP", xoá đoạn quảng cáo ở giữa).
//
// Nguồn: web cũ lưu mỗi album trong bảng SQLite "albums" (data_json) và media ở
// static/uploads/{images,videos}. Cấu trúc album:
//   { id, title, description, category_id, created_at, posts: [ { id, caption,
//     photos: [ { url, type } ], created_at } ] }
// `type` = "image" | "video"; url là đường dẫn tĩnh ("/static/uploads/...").
//
// Script đăng nhập web cũ (POST /login với csrf_token), đọc album qua
// GET /albums/<id>/posts/edit, tải media về thư mục --src, rồi đăng nhập web mới
// và tạo bài viết + upload ảnh/video.
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
/** Số bài viết tối đa cần tạo (mỗi post cũ = 1 bài viết). */
const LIMIT = Number(arg("limit", "0")) || 0;

// ── Tiện ích HTTP ────────────────────────────────────────────────────────────
function makeClient(base) {
  const jar = new Map();
  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const absorb = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  };
  return {
    cookieHeader,
    /** @param allowRedirect cho phép 3xx (đăng nhập Flask trả 302 khi thành công). */
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

/** Đăng nhập web cũ (Flask + CSRF). */
async function loginOld() {
  const c = makeClient(OLD);
  const { text } = await c.request("GET", "/login");
  const csrf = /name="csrf_token" value="([^"]+)"/.exec(text)?.[1];
  if (!csrf) throw new Error("không tìm thấy csrf_token ở web cũ");
  await c.request("POST", "/login", new URLSearchParams({ username: OLD_USER, password: OLD_PASS, csrf_token: csrf }), {
    "content-type": "application/x-www-form-urlencoded",
    referer: `${OLD}/login`,
  }, true);
  return c;
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

  const mediaDir = path.join(SRC, "media");
  fs.mkdirSync(mediaDir, { recursive: true });
  for (const p of posts) {
    for (const m of p.media) {
      const dest = path.join(mediaDir, m.name);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) continue;
      const res = await fetch(`${OLD}${m.url}`, { headers: { cookie: client.cookieHeader() } });
      if (!res.ok) {
        console.log("tải lỗi", m.url, res.status);
        continue;
      }
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    }
  }
  const album = { albumId, title, description, posts };
  fs.mkdirSync(SRC, { recursive: true });
  fs.writeFileSync(path.join(SRC, "album.json"), JSON.stringify(album, null, 2), "utf8");
  return album;
}

/** ffprobe: duration/width/height. Trả null nếu máy không có ffprobe. */
async function probe(file) {
  try {
    const { stdout } = await execFileP("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height:format=duration", "-of", "json", file,
    ], { timeout: 60_000 });
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

// ── Chạy ────────────────────────────────────────────────────────────────────
if (!ALBUM_ID) {
  console.error("Thiếu --album <album_id>. Ví dụ: --album album_a827174a");
  process.exit(1);
}

const album = has("src") && fs.existsSync(path.join(SRC, "album.json"))
  ? JSON.parse(fs.readFileSync(path.join(SRC, "album.json"), "utf8"))
  : await fetchAlbum(await loginOld(), ALBUM_ID);
const posts = LIMIT > 0 ? album.posts.slice(0, LIMIT) : album.posts;
console.log(`album "${album.title}" | posts=${album.posts.length}${LIMIT ? ` (lấy ${posts.length})` : ""}`);

/**
 * Mỗi POST của album cũ là MỘT bài viết độc lập trên web mới:
 *   tiêu đề = dòng đầu của caption (bỏ ký tự xuống dòng, tối đa 200 ký tự)
 *   nội dung = caption đầy đủ
 *   media = ảnh/video của post đó
 */
function titleFromCaption(caption) {
  const first = (caption ?? "").split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0) ?? "";
  return first.slice(0, 200) || "Bài viết";
}

/**
 * Tách link ra khỏi nội dung để giao diện hiển thị thành nút bấm:
 *   - link anonlink.io (mua/xem full video) -> watchLink
 *   - link kênh Telegram (t.me/...)       -> vipLink
 *   - đoạn "Link 1 ... ANH EM CHỌN ... Kênh VIP không cần vượt 👉 ..." bị xoá
 *
 * Có thể tắt bằng cờ --keep-links (khi triển khai thực tế sẽ nhập tay trong form).
 */
function extractLinks(caption, { keep = false } = {}) {
  const text = caption ?? "";
  if (keep) return { description: text, watchLink: null, vipLink: null };

  const urlRe = /https?:\/\/[^\s<>"']+/g;
  const all = text.match(urlRe) ?? [];
  // Link anonlink.io = nút "Xem ngay"; link t.me = nút "Kênh VIP".
  const watchLink = all.find((u) => /anonlink\.io/i.test(u)) ?? null;
  const vipLink = all.find((u) => /t\.me\//i.test(u)) ?? null;

  // Xoá đoạn quảng cáo chứa 2 link + dòng giới thiệu, giữ lại phần còn lại.
  let description = text;
  if (watchLink && vipLink) {
    // Từ "Link 1" (hoặc dòng chứa link xem) tới hết dòng chứa link kênh VIP.
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

  // Dọn khoảng trắng thừa do xoá dòng.
  description = description
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .filter((l, i, arr) => !(l.trim() === "" && arr[i - 1]?.trim() === "" && (i === 0 || arr[i - 1].trim() === "")))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { description, watchLink, vipLink };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Đăng nhập web mới (CSRF header "x-requested-with: ctc" — xem server/src/app.ts).
const nc = makeClient(NEW);
await nc.request("POST", "/api/auth/login", JSON.stringify({ username: NEW_USER, password: NEW_PASS }), {
  "content-type": "application/json",
  "x-requested-with": "ctc",
});
const api = (method, url, body, headers = {}) =>
  nc.request(method, url, body, { "x-requested-with": "ctc", ...headers }).then((r) => r.json);

// Xoá bài cũ trùng tiêu đề (tiêu đề lấy từ dòng đầu caption) nếu được yêu cầu.
if (has("replace")) {
  const wanted = new Set(posts.map((p) => titleFromCaption(p.caption)));
  const list = await api("GET", "/api/articles?limit=100");
  for (const a of list?.articles ?? []) {
    if (wanted.has(String(a.title ?? ""))) {
      await api("DELETE", `/api/admin/articles/${a.id}`);
      console.log("đã xoá bài cũ id =", a.id, `"${a.title}"`);
    }
  }
}

let imgOk = 0;
let vidOk = 0;
const created = [];

for (const [index, p] of posts.entries()) {
  const title = titleFromCaption(p.caption);
  const { description, watchLink, vipLink } = extractLinks(p.caption, { keep: has("keep-links") });
  const res = await api("POST", "/api/admin/articles", JSON.stringify({
    title,
    description,
    watchLink,
    vipLink,
    visibility: "public",
    isHot: false,
  }), { "content-type": "application/json" });
  const articleId = res.article.id;
  created.push({ articleId, title });

  for (const m of p.media) {
    const file = path.join(SRC, "media", m.name);
    if (!fs.existsSync(file)) {
      console.log("thiếu file", m.name);
      continue;
    }
    const buf = fs.readFileSync(file);
    if (m.type === "image") {
      const form = new FormData();
      form.append("file", new Blob([buf]), m.name);
      await nc.request("POST", `/api/admin/articles/${articleId}/images`, form, { "x-requested-with": "ctc" });
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
      await nc.request("POST", `/api/admin/articles/${articleId}/videos`, form, { "x-requested-with": "ctc" });
      vidOk++;
    }
  }
  console.log(`[${index + 1}/${posts.length}] bài #${articleId} "${title.slice(0, 70)}" media=${p.media.length}${watchLink ? " +nút xem ngay" : ""}${vipLink ? " +nút kênh VIP" : ""}`);
}

console.log(`xong: ${created.length} bài viết, ảnh=${imgOk} video=${vidOk}`);
for (const c of created) console.log(`  ${NEW}/bai-viet/${c.articleId}`);
