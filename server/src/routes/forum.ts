import { and, asc, desc, eq, gt, ilike, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { author, authorColumns, isStaff, requireActive } from "../auth.js";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { categories, postLikes, posts, threads, threadWatches, uploads, users } from "../db/schema.js";
import { badRequest, forbidden, idParam, notFound, ok, pageQuery, paginate, parse } from "../http.js";
import { storeImage } from "../media.js";

const THREADS_PER_PAGE = 20;
const POSTS_PER_PAGE = 20;

const lastUser = alias(users, "last_user");
const lastAuthorColumns = {
  id: lastUser.id,
  username: lastUser.username,
  avatarKey: lastUser.avatarKey,
  role: lastUser.role,
  bannedAt: lastUser.bannedAt,
  bannedUntil: lastUser.bannedUntil,
};

const titleSchema = z.string().trim().min(3, "Tiêu đề cần ít nhất 3 ký tự.").max(200, "Tiêu đề tối đa 200 ký tự.");
const contentSchema = z.string().trim().min(1, "Nội dung không được để trống.").max(20000, "Nội dung tối đa 20.000 ký tự.");

export function threadSelect() {
  return db
    .select({
      id: threads.id,
      title: threads.title,
      isPinned: threads.isPinned,
      isLocked: threads.isLocked,
      viewCount: threads.viewCount,
      replyCount: threads.replyCount,
      createdAt: threads.createdAt,
      lastPostAt: threads.lastPostAt,
      category: { id: categories.id, slug: categories.slug, title: categories.title },
      author: authorColumns,
      lastPoster: lastAuthorColumns,
    })
    .from(threads)
    .innerJoin(categories, eq(categories.id, threads.categoryId))
    .innerJoin(users, eq(users.id, threads.userId))
    .leftJoin(lastUser, eq(lastUser.id, threads.lastPostUserId))
    .$dynamic();
}

type ThreadRow = Awaited<ReturnType<ReturnType<typeof threadSelect>["execute"]>>[number];

export function mapThread(row: ThreadRow) {
  return { ...row, author: author(row.author), lastPoster: author(row.lastPoster) };
}

const viewSeen = new Map<string, number>();
function countView(ip: string, threadId: number): boolean {
  const key = `${ip}:${threadId}`;
  const now = Date.now();
  const last = viewSeen.get(key);
  if (last && now - last < 30 * 60_000) return false;
  if (viewSeen.size > 50_000) viewSeen.clear();
  viewSeen.set(key, now);
  return true;
}

async function activityFeed(hours: number, limit: number) {
  const since = new Date(Date.now() - hours * 3600_000);
  const activity = db
    .select({ threadId: posts.threadId, n: sql<number>`count(*)::int`.as("n") })
    .from(posts)
    .where(gt(posts.createdAt, since))
    .groupBy(posts.threadId)
    .as("activity");
  const rows = await threadSelect()
    .innerJoin(activity, eq(activity.threadId, threads.id))
    .orderBy(desc(activity.n), desc(threads.viewCount), desc(threads.lastPostAt))
    .limit(limit);
  return rows.map(mapThread);
}

export async function threadFeed(type: string, limit: number, offset = 0) {
  if (type === "hot") return activityFeed(24, limit);
  if (type === "trending") return activityFeed(24 * 7, limit);
  const order = type === "updated" ? desc(threads.lastPostAt) : desc(threads.createdAt);
  const rows = await threadSelect().orderBy(order).limit(limit).offset(offset);
  return rows.map(mapThread);
}

async function loadThread(id: number) {
  const [row] = await threadSelect().where(eq(threads.id, id)).limit(1);
  return row ? mapThread(row) : null;
}

async function refreshThreadLastPost(threadId: number) {
  const [last] = await db
    .select({ createdAt: posts.createdAt, userId: posts.userId })
    .from(posts)
    .where(eq(posts.threadId, threadId))
    .orderBy(desc(posts.id))
    .limit(1);
  if (last) {
    await db.update(threads).set({ lastPostAt: last.createdAt, lastPostUserId: last.userId }).where(eq(threads.id, threadId));
  }
}

export async function deleteThread(threadId: number) {
  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
  if (!thread) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      update users set
        post_count = greatest(users.post_count - c.n, 0),
        like_count = greatest(users.like_count - c.likes, 0)
      from (
        select user_id, count(*)::int as n, coalesce(sum(like_count), 0)::int as likes
        from posts where thread_id = ${threadId} group by user_id
      ) c
      where users.id = c.user_id`);
    await tx
      .update(users)
      .set({ threadCount: sql`greatest(${users.threadCount} - 1, 0)` })
      .where(eq(users.id, thread.userId));
    await tx
      .update(categories)
      .set({
        threadCount: sql`greatest(${categories.threadCount} - 1, 0)`,
        postCount: sql`greatest(${categories.postCount} - ${thread.replyCount + 1}, 0)`,
      })
      .where(eq(categories.id, thread.categoryId));
    await tx.delete(threads).where(eq(threads.id, threadId));
  });
}

export default async function forumRoutes(app: FastifyInstance) {
  app.get("/api/forum/categories", async () => {
    const cats = await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id));
    const latest = await db
      .selectDistinctOn([threads.categoryId], {
        categoryId: threads.categoryId,
        id: threads.id,
        title: threads.title,
        lastPostAt: threads.lastPostAt,
        lastPoster: lastAuthorColumns,
      })
      .from(threads)
      .leftJoin(lastUser, eq(lastUser.id, threads.lastPostUserId))
      .orderBy(threads.categoryId, desc(threads.lastPostAt));
    const byCat = new Map(latest.map((t) => [t.categoryId, t]));
    return {
      categories: cats.map((c) => {
        const t = byCat.get(c.id);
        return {
          ...c,
          latestThread: t ? { id: t.id, title: t.title, lastPostAt: t.lastPostAt, lastPoster: author(t.lastPoster) } : null,
        };
      }),
    };
  });

  app.get("/api/forum/categories/:slug", async (req) => {
    const { slug } = parse(z.object({ slug: z.string().max(64) }), req.params);
    const { page } = parse(pageQuery, req.query);
    const [cat] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
    if (!cat) throw notFound("Chuyên mục không tồn tại.");
    const { limit, offset } = paginate(page, THREADS_PER_PAGE);
    const rows = await threadSelect()
      .where(eq(threads.categoryId, cat.id))
      .orderBy(desc(threads.isPinned), desc(threads.lastPostAt))
      .limit(limit)
      .offset(offset);
    return {
      category: cat,
      threads: rows.map(mapThread),
      page,
      totalPages: Math.max(1, Math.ceil(cat.threadCount / THREADS_PER_PAGE)),
    };
  });

  app.get("/api/forum/feed", async (req) => {
    const q = parse(
      z.object({
        type: z.enum(["latest", "updated", "hot", "trending"]).default("latest"),
        limit: z.coerce.number().int().min(1).max(50).default(10),
        page: z.coerce.number().int().min(1).max(500).default(1),
      }),
      req.query,
    );
    const offset = q.type === "hot" || q.type === "trending" ? 0 : (q.page - 1) * q.limit;
    return { threads: await threadFeed(q.type, q.limit, offset), page: q.page };
  });

  app.get("/api/forum/search", async (req) => {
    const { q } = parse(z.object({ q: z.string().trim().min(2, "Nhập ít nhất 2 ký tự.").max(100) }), req.query);
    const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const rows = await threadSelect().where(ilike(threads.title, pattern)).orderBy(desc(threads.lastPostAt)).limit(30);
    return { threads: rows.map(mapThread) };
  });

  app.get("/api/forum/threads/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const { page } = parse(pageQuery, req.query);
    const thread = await loadThread(id);
    if (!thread) throw notFound("Chủ đề không tồn tại hoặc đã bị xoá.");
    if (countView(req.ip, id)) {
      await db.update(threads).set({ viewCount: sql`${threads.viewCount} + 1` }).where(eq(threads.id, id));
      thread.viewCount += 1;
    }
    const { limit, offset } = paginate(page, POSTS_PER_PAGE);
    const rows = await db
      .select({
        id: posts.id,
        content: posts.content,
        isFirst: posts.isFirst,
        likeCount: posts.likeCount,
        createdAt: posts.createdAt,
        editedAt: posts.editedAt,
        author: authorColumns,
        authorPostCount: users.postCount,
        authorJoinedAt: users.createdAt,
      })
      .from(posts)
      .innerJoin(users, eq(users.id, posts.userId))
      .where(eq(posts.threadId, id))
      .orderBy(asc(posts.id))
      .limit(limit)
      .offset(offset);
    let liked = new Set<number>();
    let watching = false;
    if (req.user && rows.length) {
      const likes = await db
        .select({ postId: postLikes.postId })
        .from(postLikes)
        .where(and(eq(postLikes.userId, req.user.id), inArray(postLikes.postId, rows.map((r) => r.id))));
      liked = new Set(likes.map((l) => l.postId));
    }
    if (req.user) {
      const [w] = await db
        .select({ threadId: threadWatches.threadId })
        .from(threadWatches)
        .where(and(eq(threadWatches.userId, req.user.id), eq(threadWatches.threadId, id)))
        .limit(1);
      watching = !!w;
    }
    return {
      thread,
      watching,
      posts: rows.map(({ authorPostCount, authorJoinedAt, ...p }) => ({
        ...p,
        author: { ...author(p.author)!, postCount: authorPostCount, joinedAt: authorJoinedAt },
        likedByMe: liked.has(p.id),
      })),
      page,
      totalPages: Math.max(1, Math.ceil((thread.replyCount + 1) / POSTS_PER_PAGE)),
    };
  });

  app.post(
    "/api/forum/threads",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (req) => {
      const user = requireActive(req);
      const body = parse(
        z.object({ categoryId: z.number().int().positive(), title: titleSchema, content: contentSchema }),
        req.body,
      );
      const [cat] = await db.select().from(categories).where(eq(categories.id, body.categoryId)).limit(1);
      if (!cat) throw badRequest("Chuyên mục không tồn tại.");
      if (cat.staffOnly && !isStaff(user)) throw forbidden("Chỉ ban quản trị được đăng trong chuyên mục này.");
      const threadId = await db.transaction(async (tx) => {
        const [t] = await tx
          .insert(threads)
          .values({ categoryId: cat.id, userId: user.id, title: body.title, lastPostUserId: user.id })
          .returning({ id: threads.id });
        await tx.insert(posts).values({ threadId: t.id, userId: user.id, content: body.content, isFirst: true });
        await tx
          .update(categories)
          .set({ threadCount: sql`${categories.threadCount} + 1`, postCount: sql`${categories.postCount} + 1` })
          .where(eq(categories.id, cat.id));
        await tx
          .update(users)
          .set({ threadCount: sql`${users.threadCount} + 1`, postCount: sql`${users.postCount} + 1` })
          .where(eq(users.id, user.id));
        await tx.insert(threadWatches).values({ userId: user.id, threadId: t.id }).onConflictDoNothing();
        return t.id;
      });
      return { thread: await loadThread(threadId) };
    },
  );

  app.patch("/api/forum/threads/:id", async (req) => {
    const user = requireActive(req);
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({
        title: titleSchema.optional(),
        isPinned: z.boolean().optional(),
        isLocked: z.boolean().optional(),
        categoryId: z.number().int().positive().optional(),
      }),
      req.body,
    );
    const [thread] = await db.select().from(threads).where(eq(threads.id, id)).limit(1);
    if (!thread) throw notFound("Chủ đề không tồn tại.");
    const staff = isStaff(user);
    const onlyTitle = body.isPinned === undefined && body.isLocked === undefined && body.categoryId === undefined;
    if (!staff && !(thread.userId === user.id && onlyTitle)) throw forbidden();

    await db.transaction(async (tx) => {
      if (body.categoryId !== undefined && body.categoryId !== thread.categoryId) {
        const [target] = await tx.select().from(categories).where(eq(categories.id, body.categoryId)).limit(1);
        if (!target) throw badRequest("Chuyên mục không tồn tại.");
        const n = thread.replyCount + 1;
        await tx
          .update(categories)
          .set({ threadCount: sql`greatest(${categories.threadCount} - 1, 0)`, postCount: sql`greatest(${categories.postCount} - ${n}, 0)` })
          .where(eq(categories.id, thread.categoryId));
        await tx
          .update(categories)
          .set({ threadCount: sql`${categories.threadCount} + 1`, postCount: sql`${categories.postCount} + ${n}` })
          .where(eq(categories.id, target.id));
      }
      await tx
        .update(threads)
        .set({
          ...(body.title !== undefined && { title: body.title }),
          ...(body.isPinned !== undefined && { isPinned: body.isPinned }),
          ...(body.isLocked !== undefined && { isLocked: body.isLocked }),
          ...(body.categoryId !== undefined && { categoryId: body.categoryId }),
        })
        .where(eq(threads.id, id));
    });
    return { thread: await loadThread(id) };
  });

  app.delete("/api/forum/threads/:id", async (req, reply) => {
    const user = requireActive(req);
    const { id } = parse(idParam, req.params);
    const [thread] = await db.select().from(threads).where(eq(threads.id, id)).limit(1);
    if (!thread) throw notFound("Chủ đề không tồn tại.");
    if (!isStaff(user) && thread.userId !== user.id) throw forbidden();
    await deleteThread(id);
    return ok(reply);
  });

  app.post(
    "/api/forum/threads/:id/posts",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req) => {
      const user = requireActive(req);
      const { id } = parse(idParam, req.params);
      const body = parse(z.object({ content: contentSchema }), req.body);
      const [thread] = await db.select().from(threads).where(eq(threads.id, id)).limit(1);
      if (!thread) throw notFound("Chủ đề không tồn tại.");
      if (thread.isLocked && !isStaff(user)) throw forbidden("Chủ đề đã bị khoá, không thể trả lời.");
      const post = await db.transaction(async (tx) => {
        const [p] = await tx.insert(posts).values({ threadId: id, userId: user.id, content: body.content }).returning();
        await tx
          .update(threads)
          .set({ replyCount: sql`${threads.replyCount} + 1`, lastPostAt: p.createdAt, lastPostUserId: user.id })
          .where(eq(threads.id, id));
        await tx.update(categories).set({ postCount: sql`${categories.postCount} + 1` }).where(eq(categories.id, thread.categoryId));
        await tx.update(users).set({ postCount: sql`${users.postCount} + 1` }).where(eq(users.id, user.id));
        await tx.insert(threadWatches).values({ userId: user.id, threadId: id }).onConflictDoNothing();
        return p;
      });
      const position = thread.replyCount + 2;
      return { post: { id: post.id }, page: Math.ceil(position / POSTS_PER_PAGE) };
    },
  );

  app.patch("/api/forum/posts/:id", async (req) => {
    const user = requireActive(req);
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ content: contentSchema }), req.body);
    const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!post) throw notFound("Bài viết không tồn tại.");
    if (post.userId !== user.id && !isStaff(user)) throw forbidden();
    const [updated] = await db
      .update(posts)
      .set({ content: body.content, editedAt: new Date() })
      .where(eq(posts.id, id))
      .returning({ id: posts.id, content: posts.content, editedAt: posts.editedAt });
    return { post: updated };
  });

  app.delete("/api/forum/posts/:id", async (req) => {
    const user = requireActive(req);
    const { id } = parse(idParam, req.params);
    const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!post) throw notFound("Bài viết không tồn tại.");
    if (post.userId !== user.id && !isStaff(user)) throw forbidden();
    if (post.isFirst) {
      await deleteThread(post.threadId);
      return { ok: true, threadDeleted: true };
    }
    const [thread] = await db.select().from(threads).where(eq(threads.id, post.threadId)).limit(1);
    await db.transaction(async (tx) => {
      await tx.delete(posts).where(eq(posts.id, id));
      await tx
        .update(threads)
        .set({ replyCount: sql`greatest(${threads.replyCount} - 1, 0)` })
        .where(eq(threads.id, post.threadId));
      if (thread) {
        await tx
          .update(categories)
          .set({ postCount: sql`greatest(${categories.postCount} - 1, 0)` })
          .where(eq(categories.id, thread.categoryId));
      }
      await tx
        .update(users)
        .set({
          postCount: sql`greatest(${users.postCount} - 1, 0)`,
          likeCount: sql`greatest(${users.likeCount} - ${post.likeCount}, 0)`,
        })
        .where(eq(users.id, post.userId));
    });
    await refreshThreadLastPost(post.threadId);
    return { ok: true, threadDeleted: false };
  });

  app.post(
    "/api/forum/posts/:id/like",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
      const user = requireActive(req);
      const { id } = parse(idParam, req.params);
      const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
      if (!post) throw notFound("Bài viết không tồn tại.");
      if (post.userId === user.id) throw badRequest("Không thể tự thích bài của mình.");
      return db.transaction(async (tx) => {
        const inserted = await tx
          .insert(postLikes)
          .values({ postId: id, userId: user.id })
          .onConflictDoNothing()
          .returning({ postId: postLikes.postId });
        const delta = inserted.length ? 1 : -1;
        if (!inserted.length) {
          await tx.delete(postLikes).where(and(eq(postLikes.postId, id), eq(postLikes.userId, user.id)));
        }
        const [p] = await tx
          .update(posts)
          .set({ likeCount: sql`greatest(${posts.likeCount} + ${delta}, 0)` })
          .where(eq(posts.id, id))
          .returning({ likeCount: posts.likeCount });
        await tx
          .update(users)
          .set({ likeCount: sql`greatest(${users.likeCount} + ${delta}, 0)` })
          .where(eq(users.id, post.userId));
        return { liked: delta > 0, likeCount: p.likeCount };
      });
    },
  );

  app.post(
    "/api/uploads/image",
    { config: { rateLimit: { max: 30, timeWindow: "10 minutes" } } },
    async (req) => {
      const user = requireActive(req);
      const file = await req.file({ limits: { fileSize: config.maxUploadMb * 1024 * 1024 } });
      if (!file) throw badRequest("Chưa chọn ảnh.");
      const stored = await storeImage("posts", await file.toBuffer());
      await db.insert(uploads).values({ userId: user.id, fileKey: stored.key, width: stored.width, height: stored.height });
      return { key: stored.key, url: `/media/p/${stored.key}.webp`, markup: `[img:${stored.key}]` };
    },
  );
}
