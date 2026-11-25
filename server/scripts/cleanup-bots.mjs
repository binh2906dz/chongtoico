// Dọn dữ liệu bot trùng và sự cố của bot đã xoá (chạy: npx tsx server/scripts/cleanup-bots.mjs)
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "pglite:./data/pglite";

const dbModule = await import("../src/db/index.js");
const { initDb, closeDb } = dbModule;
const { telegramBots, telegramBotIncidents } = await import("../src/db/schema.js");
const { eq, inArray, and, notInArray } = await import("drizzle-orm");

await initDb(process.env.DATABASE_URL);
const db = dbModule.db;

const bots = await db.select().from(telegramBots);
const ids = new Set(bots.map((b) => b.id));

// 1. The incidents of bots that no longer exist.
const incidents = await db.select().from(telegramBotIncidents);
const orphans = incidents.filter((i) => !ids.has(i.botId));
if (orphans.length) {
  const orphanIds = [...new Set(orphans.map((i) => i.botId))];
  await db.delete(telegramBotIncidents).where(inArray(telegramBotIncidents.botId, orphanIds));
  console.log(`đã xoá ${orphans.length} sự cố của bot đã xoá (${orphanIds.length} bot)`);
}

// 2. The incidents of the duplicate bots (the ones with a _xxxxxx suffix).
const dupIds = bots.filter((b) => /_[0-9a-f]{6}$/.test(b.id)).map((b) => b.id);
if (dupIds.length) {
  await db.delete(telegramBotIncidents).where(inArray(telegramBotIncidents.botId, dupIds));
  console.log(`đã xoá sự cố của ${dupIds.length} bot trùng`);
}

const after = await db.select().from(telegramBotIncidents);
console.log(`còn lại: ${after.length} sự cố`);

await closeDb();
