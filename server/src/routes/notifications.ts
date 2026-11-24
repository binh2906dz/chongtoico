import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { author, requireUser } from "../auth.js";
import { db } from "../db/index.js";
import { articles, notifications, threads, users } from "../db/schema.js";
import { ok, parse } from "../http.js";
import { unreadCount } from "../notify.js";

const PER_PAGE = 30;
const actor = alias(users, "actor");

export default async function notificationRoutes(app: FastifyInstance) {
  app.get("/api/notifications/unread-count", async (req) => {
    const user = requireUser(req);
    return { unread: await unreadCount(user.id) };
  });

  app.get("/api/notifications", async (req) => {
    const user = requireUser(req);
    const { before } = parse(z.object({ before: z.coerce.number().int().positive().optional() }), req.query);
    const rows = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        isRead: notifications.isRead,
        createdAt: notifications.createdAt,
        threadId: notifications.threadId,
        postId: notifications.postId,
        articleId: notifications.articleId,
        commentId: notifications.commentId,
        threadTitle: threads.title,
        articleTitle: articles.title,
        actor: {
          id: actor.id,
          username: actor.username,
          displayName: actor.displayName,
          avatarKey: actor.avatarKey,
          role: actor.role,
          bannedAt: actor.bannedAt,
          bannedUntil: actor.bannedUntil,
        },
      })
      .from(notifications)
      .leftJoin(actor, eq(actor.id, notifications.actorId))
      .leftJoin(threads, eq(threads.id, notifications.threadId))
      .leftJoin(articles, eq(articles.id, notifications.articleId))
      .where(and(eq(notifications.userId, user.id), before ? lt(notifications.id, before) : undefined))
      .orderBy(desc(notifications.id))
      .limit(PER_PAGE + 1);
    return {
      notifications: rows.slice(0, PER_PAGE).map((r) => ({ ...r, actor: author(r.actor?.id ? r.actor : null) })),
      hasMore: rows.length > PER_PAGE,
      unread: await unreadCount(user.id),
    };
  });

  app.post("/api/notifications/read", async (req, reply) => {
    const user = requireUser(req);
    const { ids } = parse(z.object({ ids: z.array(z.number().int().positive()).max(100).optional() }), req.body ?? {});
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.userId, user.id),
          eq(notifications.isRead, false),
          ids?.length ? inArray(notifications.id, ids) : undefined,
        ),
      );
    return ok(reply);
  });

  app.delete("/api/notifications", async (req, reply) => {
    const user = requireUser(req);
    await db.delete(notifications).where(eq(notifications.userId, user.id));
    return ok(reply);
  });
}
