// Sửa link nút "Kênh VIP" trong CSDL local PGlite (dữ liệu hiện có).
// Chạy: npx tsx server/scripts/fix-vip-link.mjs
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
    count(*) filter (where vip_link = 'https://t.me/nhomchongtoico') as old_link,
    count(*) filter (where vip_link = 'https://t.me/nhomchongtoicoo') as new_link,
    count(*) filter (where vip_link is null or vip_link = '') as empty
  from articles
`);
console.log("TRUOC khi sua:", before.rows?.[0] ?? before);

// 2. Sửa: chỉ đổi link, giữ nguyên cấu trúc.
const res = await db.execute(sql`
  update articles
  set vip_link = replace(vip_link, 'https://t.me/nhomchongtoico', 'https://t.me/nhomchongtoicoo')
  where vip_link like '%nhomchongtoico%'
`);
console.log("da sua:", res.rows?.[0]?.count ?? res.rows);

// 3. Thống kê sau khi sửa.
const after = await db.execute(sql`
  select
    count(*) filter (where vip_link = 'https://t.me/nhomchongtoico') as old_link,
    count(*) filter (where vip_link = 'https://t.me/nhomchongtoicoo') as new_link,
    count(*) filter (where vip_link is null or vip_link = '') as empty
  from articles
`);
console.log("SAU khi sua:", after.rows?.[0] ?? after);

// 4. Mẫu giá trị + kiểm tra nút "Xem ngay" không bị đụng.
const sample = await db.execute(sql`
  select id, vip_link, watch_link from articles where vip_link <> '' order by id limit 5
`);
console.log("mau:", sample.rows);

const watchCheck = await db.execute(sql`
  select count(*) filter (where watch_link like 'https://anonlink.co/%') as ok,
         count(*) filter (where watch_link like '%anonlink.io%') as bad
  from articles
`);
console.log("watch_link (nut 'Xem ngay') khong bi doi:", watchCheck.rows?.[0] ?? watchCheck);

await closeDb();
