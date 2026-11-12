import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { notifications, users } from "./db/schema.js";
import { emitTo } from "./realtime.js";

export type NotificationType = "reply" | "quote" | "comment_reply" | "follow" | "new_thread";

export interface NewNotification {
  userId: number;
  type: NotificationType;
  actorId: number;
  threadId?: number | null;
  postId?: number | null;
  articleId?: number | null;
  commentId?: number | null;
}

export async function unreadCount(userId: number) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return n;
}

/** Never throws: a failed notification must not fail the post/comment that triggered it. */
export async function notify(rows: NewNotification[]) {
  const list = rows.filter((r) => r.userId !== r.actorId);
  if (!list.length) return;
  try {
    // Collapse repeated unread "reply" notifications for the same thread into the newest one.
    const replies = list.filter((r) => r.type === "reply" && r.threadId);
    if (replies.length) {
      await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.type, "reply"),
            eq(notifications.isRead, false),
            eq(notifications.threadId, replies[0].threadId!),
            inArray(
              notifications.userId,
              replies.map((r) => r.userId),
            ),
          ),
        );
    }
    for (const f of list.filter((r) => r.type === "follow")) {
      await db
        .delete(notifications)
        .where(and(eq(notifications.type, "follow"), eq(notifications.userId, f.userId), eq(notifications.actorId, f.actorId)));
    }
    for (let i = 0; i < list.length; i += 500) await db.insert(notifications).values(list.slice(i, i + 500));
    for (const userId of new Set(list.map((r) => r.userId))) {
      emitTo(`user:${userId}`, "notification", { unread: await unreadCount(userId) });
    }
  } catch {
    /* best effort */
  }
}

/** Usernames quoted with [quote=name] in BBCode content, lower-cased, at most 5. */
export function quotedUsernames(content: string) {
  const names = new Set<string>();
  for (const m of content.matchAll(/\[quote=([^\]\n]{1,32})\]/gi)) {
    names.add(m[1].trim().toLowerCase());
    if (names.size >= 5) break;
  }
  return [...names];
}

export async function usersByLowerNames(names: string[]) {
  if (!names.length) return [];
  return db.select({ id: users.id }).from(users).where(inArray(users.usernameLower, names));
}
