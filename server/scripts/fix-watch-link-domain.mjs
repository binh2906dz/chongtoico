// Sửa domain nút "Xem ngay" trong CSDL local PGlite (dữ liệu hiện có).
// Chạy: npx tsx server/scripts/fix-watch-link-domain.mjs
// Phải DỪNG server trước khi chạy (PGlite không cho 2 tiến trình mở cùng DB).
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "pglite:./data/pglite";

const dbModule = await import("../src/db/index.js");
const { initDb, closeDb } = dbModule;
const { articles } = await import("../src/db/schema.js");
const { sql } = await import("drizzle-orm");

await initDb(process.env.DATABASE_URL);
const db = dbModule.db;

// 1. Thống kê trước khi sửa.
const before = await db.execute(sql`
  select
    count(*) filter (where watch_link like '%anonlink.io%') as io,
    count(*) filter (where watch_link like '%anonlink.co%') as co,
    count(*) filter (where watch_link is null or watch_link = '') as empty
  from articles
`);
console.log("TRUOC khi sua:", before.rows?.[0] ?? before);

// 2. Sửa: chỉ đổi tên miền, giữ nguyên phần sau.
const res = await db.execute(sql`
  update articles
  set watch_link = replace(watch_link, 'https://anonlink.io/', 'https://anonlink.co/')
  where watch_link like '%anonlink.io%'
`);
console.log("da sua:", res.rows?.[0]?.count ?? res.rows);

// 3. Thống kê sau khi sửa.
const after = await db.execute(sql`
  select
    count(*) filter (where watch_link like '%anonlink.io%') as io,
    count(*) filter (where watch_link like '%anonlink.co%') as co,
    count(*) filter (where watch_link is null or watch_link = '') as empty
  from articles
`);
console.log("SAU khi sua:", after.rows?.[0] ?? after);

// 4. Mẫu giá trị.
const sample = await db.execute(sql`
  select id, watch_link from articles where watch_link <> '' order by id limit 5
`);
console.log("mau:", sample.rows);

await closeDb();
