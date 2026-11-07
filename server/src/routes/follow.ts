import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { author, authorColumns, requireActive, requireUser } from "../auth.js";
import { db } from "../db/index.js";
import { threads, threadWatches, userFollows, users } from "../db/schema.js";
import { badRequest, idParam, notFound, pageQuery, paginate, parse } from "../http.js";
import { notify } from "../notify.js";
import { mapThread, threadSelect } from "./forum.js";

const PER_PAGE = 20;

export async function followStats(userId: number, viewerId: number | null) {
  const [[followers], [following], mine] = await Promise.all([
    db.select({ n: count() }).from(userFollows).where(eq(userFollows.followingId, userId)),
    db.select({ n: count() }).from(userFollows).where(eq(userFollows.followerId, userId)),
    viewerId
      ? db
          .select({ id: userFollows.followerId })
          .from(userFollows)
          .where(and(eq(userFollows.followerId, viewerId), eq(userFollows.followingId, userId)))
          .limit(1)
      : Promise.resolve([]),
  ]);
  return { followerCount: followers.n, followingCount: following.n, followedByMe: mine.length > 0 };
}

export default async function followRoutes(app: FastifyInstance) {
  app.post(
    "/api/forum/threads/:id/watch",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
      const user = requireActive(req);
      const { id } = parse(idParam, req.params);
      const [thread] = await db.select({ id: threads.id }).from(threads).where(eq(threads.id, id)).limit(1);
      if (!thread) throw notFound("Chủ đề không tồn tại.");
      const inserted = await db
        .insert(threadWatches)
        .values({ userId: user.id, threadId: id })
        .onConflictDoNothing()
        .returning({ threadId: threadWatches.threadId });
      if (!inserted.length) {
        await db.delete(threadWatches).where(and(eq(threadWatches.userId, user.id), eq(threadWatches.threadId, id)));
      }
      return { watching: inserted.length > 0 };
    },
  );

  app.post(
    "/api/members/:username/follow",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
      const me = requireActive(req);
      const { username } = parse(z.object({ username: z.string().max(32) }), req.params);
      const [target] = await db.select({ id: users.id }).from(users).where(eq(users.usernameLower, username.toLowerCase())).limit(1);
      if (!target) throw notFound("Thành viên không tồn tại.");
      if (target.id === me.id) throw badRequest("Không thể tự theo dõi chính mình.");
      const inserted = await db
        .insert(userFollows)
        .values({ followerId: me.id, followingId: target.id })
        .onConflictDoNothing()
        .returning({ id: userFollows.followingId });
      if (!inserted.length) {
        await db.delete(userFollows).where(and(eq(userFollows.followerId, me.id), eq(userFollows.followingId, target.id)));
      } else {
        await notify([{ userId: target.id, type: "follow", actorId: me.id }]);
      }
      return followStats(target.id, me.id);
    },
  );

  app.get("/api/me/watching", async (req) => {
    const user = requireUser(req);
    const { page } = parse(pageQuery, req.query);
    const { limit, offset } = paginate(page, PER_PAGE);
    const [[{ total }], rows] = await Promise.all([
      db.select({ total: count() }).from(threadWatches).where(eq(threadWatches.userId, user.id)),
      threadSelect()
        .innerJoin(threadWatches, and(eq(threadWatches.threadId, threads.id), eq(threadWatches.userId, user.id)))
        .orderBy(desc(threads.lastPostAt))
        .limit(limit)
        .offset(offset),
    ]);
    return { threads: rows.map(mapThread), page, totalPages: Math.max(1, Math.ceil(total / PER_PAGE)) };
  });

  app.get("/api/me/following-feed", async (req) => {
    const user = requireUser(req);
    const { page } = parse(pageQuery, req.query);
    const { limit, offset } = paginate(page, PER_PAGE);
    const followed = db.select({ id: userFollows.followingId }).from(userFollows).where(eq(userFollows.followerId, user.id));
    const rows = await threadSelect()
      .where(inArray(threads.userId, followed))
      .orderBy(desc(threads.createdAt))
      .limit(limit + 1)
      .offset(offset);
    return { threads: rows.slice(0, limit).map(mapThread), page, hasMore: rows.length > limit };
  });

  app.get("/api/me/following", async (req) => {
    const user = requireUser(req);
    const rows = await db
      .select({ ...authorColumns, since: userFollows.createdAt, lastSeenAt: users.lastSeenAt, postCount: users.postCount })
      .from(userFollows)
      .innerJoin(users, eq(users.id, userFollows.followingId))
      .where(eq(userFollows.followerId, user.id))
      .orderBy(desc(userFollows.createdAt))
      .limit(500);
    return {
      users: rows.map((r) => ({ ...author(r)!, since: r.since, lastSeenAt: r.lastSeenAt, postCount: r.postCount })),
    };
  });
}
