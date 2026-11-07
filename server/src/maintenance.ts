import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { notifications, sessions, videoViewDays } from "./db/schema.js";
import { removeImage } from "./media.js";

const EVERY = 6 * 3600_000;
let timer: NodeJS.Timeout | null = null;

/** Editor images uploaded more than a day ago that nothing references any more (deleted/edited posts, abandoned drafts). */
async function removeOrphanUploads() {
  let removed = 0;
  for (let round = 0; round < 20; round += 1) {
    const rows = (await db.execute(sql`
      delete from uploads where id in (
        select u.id from uploads u
        where u.created_at < now() - interval '1 day'
          and not exists (select 1 from posts p where strpos(p.content, '[img:' || u.file_key || ']') > 0)
          and not exists (select 1 from site_settings s where strpos(s.value, '[img:' || u.file_key || ']') > 0)
          and not exists (select 1 from videos v where strpos(v.description, '[img:' || u.file_key || ']') > 0)
        limit 500
      ) returning file_key`)) as unknown as { rows: { file_key: string }[] };
    for (const r of rows.rows) await removeImage("posts", r.file_key);
    removed += rows.rows.length;
    if (rows.rows.length < 500) break;
  }
  return removed;
}

export async function runMaintenance(log: (msg: string) => void) {
  try {
    const now = new Date();
    const expired = await db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id });
    const orphans = await removeOrphanUploads();
    const cutoffDay = new Date(Date.now() + 7 * 3600_000 - 60 * 86400_000).toISOString().slice(0, 10);
    await db.delete(videoViewDays).where(lt(videoViewDays.day, cutoffDay));
    await db
      .delete(notifications)
      .where(and(eq(notifications.isRead, true), lt(notifications.createdAt, new Date(Date.now() - 90 * 86400_000))));
    log(`maintenance: ${expired.length} expired sessions, ${orphans} orphan images removed`);
  } catch (err) {
    log(`maintenance failed: ${(err as Error).message}`);
  }
}

export function startMaintenance(log: (msg: string) => void) {
  const first = setTimeout(() => void runMaintenance(log), 60_000);
  first.unref();
  timer = setInterval(() => void runMaintenance(log), EVERY);
  timer.unref();
}

export function stopMaintenance() {
  if (timer) clearInterval(timer);
  timer = null;
}
