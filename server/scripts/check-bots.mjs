// Kiểm tra nhanh dữ liệu bot trong CSDL (chạy: node server/scripts/check-bots.mjs)
process.env.DATABASE_URL = "pglite:./data/pglite";

const dbModule = await import("../src/db/index.js");
const { initDb, closeDb } = dbModule;
const { telegramBots, telegramBotIncidents, telegramUsers, telegramUserLinks } = await import("../src/db/schema.js");
const { count } = await import("drizzle-orm");

await initDb(process.env.DATABASE_URL);

const bots = await dbModule.db.select().from(telegramBots);
console.log(`tổng bot trong CSDL: ${bots.length}`);
const byStatus = {};
for (const b of bots) byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;
console.log("theo trạng thái:", byStatus);

const e56 = bots.filter((b) => b.id.startsWith("e56c295b5"));
console.log("e56c:", e56.map((b) => ({ id: b.id, status: b.status, name: b.displayName })));

const [users] = await dbModule.db.select({ n: count() }).from(telegramUsers);
const [links] = await dbModule.db.select({ n: count() }).from(telegramUserLinks);
const [inc] = await dbModule.db.select({ n: count() }).from(telegramBotIncidents);
console.log(`user: ${users?.n}, link: ${links?.n}, incident: ${inc?.n}`);

const dup = new Map();
for (const b of bots) dup.set(b.id, (dup.get(b.id) ?? 0) + 1);
console.log("id trùng:", [...dup.entries()].filter(([, n]) => n > 1));

await closeDb();
