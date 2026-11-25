// Dọn file media rác trong thư mục uploads: xóa file KHÔNG được bản ghi nào
// trong CSDL tham chiếu (ảnh bài bị xóa, thumb sinh ra rồi bài bị xóa, video rác).
//
// Mỗi ảnh được lưu thành 4 file: <key>.webp, <key>_t.webp, <key>_s.webp, <key>_m.webp
// nên khi quét phải bỏ hậu tố _t/_s/_m để tìm key gốc.
//
// Dùng: npx tsx scripts/purge-orphan-media.mjs [--dry]
// PHẢI DỪNG server trước khi chạy (PGlite không cho 2 tiến trình mở cùng DB).
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "pglite:./data/pglite";

const dbModule = await import("../src/db/index.js");
await dbModule.initDb(process.env.DATABASE_URL);
const db = dbModule.db;
const fs = await import("node:fs");
const path = await import("node:path");

const uploadDir = path.resolve(process.env.UPLOAD_DIR || "./data/uploads");
const DRY = process.argv.includes("--dry");

// Gom mọi key đang được tham chiếu.
const used = new Set();
const add = (k) => {
  if (k) used.add(k);
};
for (const r of (await db.execute(`select file_key from article_images`)).rows ?? []) add(r.file_key);
for (const r of (await db.execute(`select file_key, thumb_key from article_videos`)).rows ?? []) {
  add(r.file_key);
  add(r.thumb_key);
}
for (const r of (await db.execute(`select cover_image_key from articles where cover_image_key is not null`)).rows ?? []) {
  add(r.cover_image_key);
}
for (const r of (await db.execute(`select avatar_key from users where avatar_key is not null`)).rows ?? []) add(r.avatar_key);
for (const r of (await db.execute(`select file_key from uploads`)).rows ?? []) add(r.file_key);
for (const r of (await db.execute(`select value from site_settings`)).rows ?? []) {
  const val = typeof r.value === "string" ? JSON.parse(r.value) : r.value;
  for (const slot of Object.keys(val?.ads ?? {})) add(val.ads[slot]?.imageKey);
}

// Key gốc của file trên đĩa (bỏ hậu tố resize _t/_s/_m).
const keyOf = (filename) => path.parse(filename).name.replace(/_(t|s|m)$/, "");

let removed = 0;
let bytes = 0;
const perDir = {};
if (!fs.existsSync(uploadDir)) {
  console.log(`thư mục uploads không tồn tại: ${uploadDir}`);
} else {
  for (const sub of fs.readdirSync(uploadDir)) {
    const dir = path.join(uploadDir, sub);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const filename of fs.readdirSync(dir)) {
      const p = path.join(dir, filename);
      if (!fs.statSync(p).isFile()) continue;
      if (used.has(keyOf(filename))) continue;
      const size = fs.statSync(p).size;
      if (DRY) {
        console.log(`  [dry] ${sub}/${filename} (${(size / 1024).toFixed(0)} KB)`);
      } else {
        fs.unlinkSync(p);
      }
      removed++;
      bytes += size;
      perDir[sub] = (perDir[sub] ?? 0) + 1;
    }
  }
}

console.log(`\n${DRY ? "[DRY] " : ""}đã xóa ${removed} file, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
for (const [dir, n] of Object.entries(perDir)) console.log(`  ${dir}: ${n} file`);

let left = 0;
for (const sub of fs.readdirSync(uploadDir)) {
  const dir = path.join(uploadDir, sub);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const filename of fs.readdirSync(dir)) {
    const p = path.join(dir, filename);
    if (!fs.statSync(p).isFile()) continue;
    if (!used.has(keyOf(filename))) left++;
  }
}
console.log(`file rác còn lại: ${left}`);

await dbModule.closeDb();
