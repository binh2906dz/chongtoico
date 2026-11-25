// Thống kê bài viết sau khi import (chạy: npx tsx server/scripts/count-articles.mjs)
// Phải DỪNG server trước khi chạy (PGlite không cho 2 tiến trình mở cùng DB).
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "pglite:./data/pglite";

const dbModule = await import("../src/db/index.js");
const { initDb, closeDb } = dbModule;
const { articles, articleImages, articleVideos } = await import("../src/db/schema.js");
const { count, sql } = await import("drizzle-orm");

await initDb(process.env.DATABASE_URL);
const db = dbModule.db;

const [tot] = await db.select({ n: count() }).from(articles);
const [imgs] = await db.select({ n: count() }).from(articleImages);
const [vids] = await db.select({ n: count() }).from(articleVideos);
const [watch] = await db.select({ n: count() }).from(articles).where(sql`${articles.watchLink} is not null`);
const [vip] = await db.select({ n: count() }).from(articles).where(sql`${articles.vipLink} is not null`);
const [noMedia] = await db.select({ n: count() }).from(articles).where(sql`${articles.imageCount} = 0 and ${articles.videoCount} = 0`);

console.log(`bài viết: ${tot?.n}`);
console.log(`  có nút "Xem ngay": ${watch?.n}`);
console.log(`  có nút "Kênh VIP": ${vip?.n}`);
console.log(`  ảnh: ${imgs?.n} | video: ${vids?.n}`);
console.log(`  bài không có media: ${noMedia?.n}`);

await closeDb();
