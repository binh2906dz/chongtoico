import { count, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { author, authorColumns, profileUser } from "../auth.js";
import { db } from "../db/index.js";
import { posts, threads, users } from "../db/schema.js";
import { notFound, parse } from "../http.js";
import { getOnline } from "../realtime.js";
import { hotAlbums } from "./albums.js";
import { followStats } from "./follow.js";
import { threadFeed } from "./forum.js";
import { listVideoCategories, listVideos } from "./videos.js";

export async function forumStats() {
  const [[t], [p], [u], [latest]] = await Promise.all([
    db.select({ n: count() }).from(threads),
    db.select({ n: count() }).from(posts),
    db.select({ n: count() }).from(users),
    db.select(authorColumns).from(users).orderBy(desc(users.id)).limit(1),
  ]);
  return {
    threads: t.n,
    posts: p.n,
    members: u.n,
    newestMember: author(latest ?? null),
    online: getOnline(),
  };
}

export default async function memberRoutes(app: FastifyInstance) {
  app.get("/api/stats", async () => forumStats());

  app.get("/api/home", async (req) => {
    const [albums, today, newest, videoCategories, latest, hot, trending, stats] = await Promise.all([
      hotAlbums(!!req.user, 8),
      listVideos({ sort: "today", limit: 8 }),
      listVideos({ sort: "new", limit: 24 }),
      listVideoCategories(),
      threadFeed("latest", 10),
      threadFeed("hot", 10),
      threadFeed("trending", 10),
      forumStats(),
    ]);
    return {
      videos: { today: today.rows, newest: newest.rows },
      videoCategories,
      hotAlbums: albums,
      feeds: { latest, hot, trending },
      stats,
    };
  });

  app.get("/api/members/:username", async (req) => {
    const { username } = parse(z.object({ username: z.string().max(32) }), req.params);
    const [user] = await db.select().from(users).where(eq(users.usernameLower, username.toLowerCase())).limit(1);
    if (!user) throw notFound("Thành viên không tồn tại.");
    const recent = await db
      .select({ id: threads.id, title: threads.title, createdAt: threads.createdAt, replyCount: threads.replyCount, viewCount: threads.viewCount })
      .from(threads)
      .where(eq(threads.userId, user.id))
      .orderBy(desc(threads.createdAt))
      .limit(15);
    return { user: profileUser(user), recentThreads: recent, follow: await followStats(user.id, req.user?.id ?? null) };
  });
}
