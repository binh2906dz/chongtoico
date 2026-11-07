import { and, count, desc, eq, gt, isNotNull, isNull, or } from "drizzle-orm";
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

const RANK_LIMIT = 10;

export async function rankings() {
  const now = new Date();
  const base = { ...authorColumns, postCount: users.postCount, likeCount: users.likeCount, createdAt: users.createdAt };
  const [topLiked, topPosters, newest, banned] = await Promise.all([
    db.select(base).from(users).where(gt(users.likeCount, 0)).orderBy(desc(users.likeCount), desc(users.postCount)).limit(RANK_LIMIT),
    db.select(base).from(users).where(gt(users.postCount, 0)).orderBy(desc(users.postCount), desc(users.likeCount)).limit(RANK_LIMIT),
    db.select(base).from(users).orderBy(desc(users.createdAt)).limit(RANK_LIMIT),
    db
      .select({ ...base, banReason: users.banReason, bannedUntil: users.bannedUntil })
      .from(users)
      .where(and(isNotNull(users.bannedAt), or(isNull(users.bannedUntil), gt(users.bannedUntil, now))))
      .orderBy(desc(users.bannedAt))
      .limit(RANK_LIMIT),
  ]);
  const map = (r: (typeof topLiked)[number]) => ({
    ...author(r)!,
    postCount: r.postCount,
    likeCount: r.likeCount,
    createdAt: r.createdAt,
  });
  return {
    topLiked: topLiked.map(map),
    topPosters: topPosters.map(map),
    newest: newest.map(map),
    banned: banned.map((r) => ({ ...map(r), banReason: r.banReason, bannedUntil: r.bannedUntil })),
  };
}

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
  app.get("/api/members/rankings", async () => rankings());

  app.get("/api/stats", async () => forumStats());

  app.get("/api/home", async (req) => {
    const [albums, today, newest, videoCategories, latest, hot, trending, ranks, stats] = await Promise.all([
      hotAlbums(!!req.user, 8),
      listVideos({ sort: "today", limit: 8 }),
      listVideos({ sort: "new", limit: 24 }),
      listVideoCategories(),
      threadFeed("latest", 10),
      threadFeed("hot", 10),
      threadFeed("trending", 10),
      rankings(),
      forumStats(),
    ]);
    return {
      videos: { today: today.rows, newest: newest.rows },
      videoCategories,
      hotAlbums: albums,
      feeds: { latest, hot, trending },
      rankings: ranks,
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
