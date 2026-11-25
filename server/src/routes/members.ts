import { count, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { author, authorColumns, profileUser, type User } from "../auth.js";
import { db } from "../db/index.js";
import { posts, threads, users } from "../db/schema.js";
import { notFound, parse } from "../http.js";
import { getOnline } from "../realtime.js";
import { followStats } from "./follow.js";
import { threadFeed } from "./forum.js";
import { articlesByIds, listArticles, watchingNowIds } from "./articles.js";

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
    listArticles({ sort: "random", limit: 8, viewer }),
    articlesByIds(watchingNowIds(8), viewer),
    threadFeed("latest", 8),
    threadFeed("hot", 8),
    threadFeed("trending", 8),
    forumStats(),
  ]);
  return {
    articles: { today: today.rows, week: week.rows, newest: newest.rows, random: random.rows, watching },
    feeds: { latest, hot, trending },
    stats,
  };
}

/** Guests all get the same home page, so it is built at most once per HOME_CACHE_MS. */
const HOME_CACHE_MS = 30_000;
let guestHome: { at: number; data: Promise<Awaited<ReturnType<typeof homeData>>> } | null = null;

function cachedGuestHome() {
  if (!guestHome || Date.now() - guestHome.at > HOME_CACHE_MS) {
    const entry = { at: Date.now(), data: homeData() };
    entry.data.catch(() => {
      if (guestHome === entry) guestHome = null;
    });
    guestHome = entry;
  }
  return guestHome.data;
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
