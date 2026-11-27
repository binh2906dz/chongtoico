// Kiem tra chiến dịch mới: queue đúng 1 job cho mỗi ID, không nhân bản.
import { initDb, db, closeDb } from "/app/server/dist/db/index.js";
import { sql } from "drizzle-orm";
import { config } from "/app/server/dist/config.js";
import { queueCampaign, runSchedulerTick } from "/app/server/dist/scheduler.js";

await initDb(config.databaseUrl);

const id = "test-b114";
await db.execute(sql`delete from notification_jobs where campaign_id = ${id}`);
await db.execute(sql`delete from telegram_campaigns where id = ${id}`);
await db.execute(
  sql`insert into telegram_campaigns (id, name, text, target_type, target_ids, buttons, article_ids, is_emergency, schedule, schedule_status, created_at)
      values (${id}, 'Test B114', 'Xin chao', 'imported', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, 'now', 'active', now())`,
);

const t0 = Date.now();
const r1 = await queueCampaign(id, new Date());
console.log("lan 1:", JSON.stringify(r1), `${Date.now() - t0}ms`);

// Vong lap scheduler chay lai ngay -> phai KHONG tao them job.
await db.execute(sql`update telegram_campaigns set schedule_status = 'active' where id = ${id}`);
await runSchedulerTick();
await runSchedulerTick();

const rows = await db.execute(
  sql`select count(*)::int as jobs, count(distinct telegram_id)::int as ids from notification_jobs where campaign_id = ${id}`,
);
console.log("sau khi scheduler chay lai 2 lan:", JSON.stringify(rows.rows[0]));
console.log("=> DUNG neu jobs == ids");

const users = await db.execute(sql`select count(*)::int as n from telegram_users`);
console.log("tong so id trong danh sach:", users.rows[0].n);

await db.execute(sql`delete from notification_jobs where campaign_id = ${id}`);
await db.execute(sql`delete from telegram_campaigns where id = ${id}`);
await closeDb();
