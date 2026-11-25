import { count, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { author, authorColumns, profileUser, type User } from "../auth.js";
import { db } from "../db/index.js";
import { posts, threads, users } from "../db/schema.js";
import { notFound, parse } from "../http.js";
import { getOnline } from "../realtime.js";
import { cachedGuestHome as cachedGuestHomeCached } from "../routeCache.js";
import { followStats } from "./follow.js";
import { threadFeed } from "./forum.js";
import { articlesByIds, listArticles, randomArticleIds, watchingNowIds } from "./articles.js";

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

async function homeData(viewer: User | null = null) {
  const [today, week, newest, random, watching, latest, hot, trending, stats] = await Promise.all([
    listArticles({ sort: "today", limit: 8, viewer }),
    listArticles({ sort: "week", limit: 8, viewer }),
    listArticles({ sort: "new", limit: 24, viewer }),
    // Dùng chung cache 5 phút với endpoint /api/articles/random: trang chủ và
    // khối random luôn hiện CÙNG một bộ bài, và chỉ có 1 truy vấn DB / 5 phút.
    articlesByIds(await randomArticleIds(8), viewer),
    articlesByIds(watchingNowIds(8), viewer),
    threadFeed("latest", 8),
    threadFeed("hot", 8),
    threadFeed("trending", 8),
    forumStats(),
  ]);
  return {
    articles: { today: today.rows, week: week.rows, newest: newest.rows, random, watching },
    feeds: { latest, hot, trending },
    stats,
  };
}

/** Guests all get the same home page, so it is built at most once per HOME_CACHE_MS. */
const HOME_CACHE_MS = 30_000;

function cachedGuestHome() {
  return cachedGuestHomeCached(homeData, HOME_CACHE_MS);
}

export default async function memberRoutes(app: FastifyInstance) {
  app.get("/api/stats", async () => forumStats());

  app.get("/api/home", async (req) => (req.user ? homeData(req.user) : cachedGuestHome()));

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
