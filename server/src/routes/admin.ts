import { asc, count, desc, eq, gt, ilike, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hashPassword, isAdmin, profileUser, requireAdmin, requireStaff, ROLES } from "../auth.js";
import { db } from "../db/index.js";
import {
  articles,
  categories,
  chatChannels,
  chatMessages,
  posts,
  reports,
  sessions,
  supportConversations,
  threads,
  users,
} from "../db/schema.js";
import { badRequest, forbidden, idParam, isUniqueViolation, notFound, ok, pageQuery, parse } from "../http.js";

export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "Đường dẫn chỉ gồm chữ thường không dấu, số và dấu gạch ngang.");

const categoryBody = z.object({
  slug: slugSchema,
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).default(""),
  icon: z.string().trim().min(1).max(16).default("💬"),
  sortOrder: z.number().int().default(0),
  staffOnly: z.boolean().default(false),
});

const channelBody = z.object({
  slug: slugSchema,
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).default(""),
  sortOrder: z.number().int().default(0),
  staffOnly: z.boolean().default(false),
});

export default async function adminRoutes(app: FastifyInstance) {
  app.get("/api/admin/overview", async (req) => {
    requireStaff(req);
    const dayAgo = new Date(Date.now() - 86400_000);
    const [[u], [u24], [t], [p], [a], [m], [openSupport], [openReports]] = await Promise.all([
      db.select({ n: count() }).from(users),
      db.select({ n: count() }).from(users).where(gt(users.createdAt, dayAgo)),
      db.select({ n: count() }).from(threads),
      db.select({ n: count() }).from(posts),
      db.select({ n: count() }).from(articles),
      db.select({ n: count() }).from(chatMessages),
      db.select({ n: count() }).from(supportConversations).where(eq(supportConversations.status, "open")),
      db.select({ n: count() }).from(reports).where(eq(reports.status, "open")),
    ]);
    return {
      members: u.n,
      newMembers24h: u24.n,
      threads: t.n,
      posts: p.n,
      articles: a.n,
      chatMessages: m.n,
      openSupport: openSupport.n,
      openReports: openReports.n,
    };
  });

  app.get("/api/admin/users", async (req) => {
    requireStaff(req);
    const q = parse(pageQuery.extend({ q: z.string().trim().max(32).default("") }), req.query);
    const where = q.q ? ilike(users.usernameLower, `%${q.q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`) : undefined;
    const perPage = 30;
    const [[{ total }], rows] = await Promise.all([
      db.select({ total: count() }).from(users).where(where),
      db
        .select()
        .from(users)
        .where(where)
        .orderBy(desc(users.id))
        .limit(perPage)
        .offset((q.page - 1) * perPage),
    ]);
    return { users: rows.map(profileUser), page: q.page, totalPages: Math.max(1, Math.ceil(total / perPage)) };
  });

  app.patch("/api/admin/users/:id/role", async (req) => {
    const me = requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const { role } = parse(z.object({ role: z.enum(ROLES) }), req.body);
    if (id === me.id) throw badRequest("Không thể tự đổi quyền của chính mình.");
    const [user] = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
    if (!user) throw notFound("Thành viên không tồn tại.");
    return { user: profileUser(user) };
  });

  app.post("/api/admin/users/:id/ban", async (req) => {
    const me = requireStaff(req);
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({
        reason: z.string().trim().min(1, "Cần ghi lý do khoá.").max(300),
        days: z.number().int().min(1).max(3650).nullable().default(null),
      }),
      req.body,
    );
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw notFound("Thành viên không tồn tại.");
    if (target.id === me.id) throw badRequest("Không thể tự khoá chính mình.");
    if (target.role === "admin" || (target.role === "mod" && !isAdmin(me))) throw forbidden("Không thể khoá thành viên ban quản trị.");
    const now = new Date();
    const [user] = await db
      .update(users)
      .set({
        bannedAt: now,
        bannedUntil: body.days ? new Date(now.getTime() + body.days * 86400_000) : null,
        banReason: body.reason,
      })
      .where(eq(users.id, id))
      .returning();
    return { user: profileUser(user) };
  });

  app.post("/api/admin/users/:id/unban", async (req) => {
    requireStaff(req);
    const { id } = parse(idParam, req.params);
    const [user] = await db
      .update(users)
      .set({ bannedAt: null, bannedUntil: null, banReason: null })
      .where(eq(users.id, id))
      .returning();
    if (!user) throw notFound("Thành viên không tồn tại.");
    return { user: profileUser(user) };
  });

  app.post("/api/admin/users/:id/password", async (req) => {
    const me = requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const { password } = parse(
      z.object({ password: z.string().min(6, "Mật khẩu cần ít nhất 6 ký tự.").max(100, "Mật khẩu tối đa 100 ký tự.") }),
      req.body,
    );
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw notFound("Thành viên không tồn tại.");
    if (target.id === me.id) throw badRequest("Hãy đổi mật khẩu của chính mình trong trang tài khoản.");
    if (target.role === "admin") throw forbidden("Không thể đặt lại mật khẩu của quản trị viên khác.");
    await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, id));
    await db.delete(sessions).where(eq(sessions.userId, id));
    return { ok: true };
  });

  app.post("/api/admin/users/:id/logout", async (req, reply) => {
    requireAdmin(req);
    const { id } = parse(idParam, req.params);
    await db.delete(sessions).where(eq(sessions.userId, id));
    return ok(reply);
  });

  app.get("/api/admin/categories", async (req) => {
    requireStaff(req);
    return { categories: await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id)) };
  });

  app.post("/api/admin/categories", async (req) => {
    requireAdmin(req);
    const body = parse(categoryBody, req.body);
    try {
      const [cat] = await db.insert(categories).values(body).returning();
      return { category: cat };
    } catch (err) {
      if (isUniqueViolation(err)) throw badRequest("Đường dẫn chuyên mục đã tồn tại.");
      throw err;
    }
  });

  app.patch("/api/admin/categories/:id", async (req) => {
    requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const body = parse(categoryBody.partial(), req.body);
    try {
      const [cat] = await db.update(categories).set(body).where(eq(categories.id, id)).returning();
      if (!cat) throw notFound("Chuyên mục không tồn tại.");
      return { category: cat };
    } catch (err) {
      if (isUniqueViolation(err)) throw badRequest("Đường dẫn chuyên mục đã tồn tại.");
      throw err;
    }
  });

  app.delete("/api/admin/categories/:id", async (req, reply) => {
    requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const [cat] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!cat) throw notFound("Chuyên mục không tồn tại.");
    const [{ n }] = await db.select({ n: count() }).from(threads).where(eq(threads.categoryId, id));
    if (n > 0) throw badRequest("Chuyên mục còn chủ đề. Hãy chuyển hoặc xoá các chủ đề trước.");
    await db.delete(categories).where(eq(categories.id, id));
    return ok(reply);
  });

  app.get("/api/admin/channels", async (req) => {
    requireStaff(req);
    return { channels: await db.select().from(chatChannels).orderBy(asc(chatChannels.sortOrder), asc(chatChannels.id)) };
  });

  app.post("/api/admin/channels", async (req) => {
    requireAdmin(req);
    const body = parse(channelBody, req.body);
    try {
      const [channel] = await db.insert(chatChannels).values(body).returning();
      return { channel };
    } catch (err) {
      if (isUniqueViolation(err)) throw badRequest("Đường dẫn kênh đã tồn tại.");
      throw err;
    }
  });

  app.patch("/api/admin/channels/:id", async (req) => {
    requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const body = parse(channelBody.partial(), req.body);
    try {
      const [channel] = await db.update(chatChannels).set(body).where(eq(chatChannels.id, id)).returning();
      if (!channel) throw notFound("Kênh không tồn tại.");
      return { channel };
    } catch (err) {
      if (isUniqueViolation(err)) throw badRequest("Đường dẫn kênh đã tồn tại.");
      throw err;
    }
  });

  app.delete("/api/admin/channels/:id", async (req, reply) => {
    requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const [{ n }] = await db.select({ n: count() }).from(chatChannels);
    if (n <= 1) throw badRequest("Phải còn ít nhất một kênh chat.");
    const [channel] = await db.delete(chatChannels).where(eq(chatChannels.id, id)).returning();
    if (!channel) throw notFound("Kênh không tồn tại.");
    return ok(reply);
  });

  app.post("/api/admin/recount", async (req, reply) => {
    requireAdmin(req);
    await db.execute(sql`
      update users u set
        thread_count = (select count(*) from threads t where t.user_id = u.id),
        post_count = (select count(*) from posts p where p.user_id = u.id),
        like_count = (select coalesce(sum(p.like_count), 0) from posts p where p.user_id = u.id),
        message_count = (select count(*) from chat_messages m where m.user_id = u.id)`);
    await db.execute(sql`
      update threads t set reply_count = greatest((select count(*) from posts p where p.thread_id = t.id) - 1, 0)`);
    await db.execute(sql`
      update categories c set
        thread_count = (select count(*) from threads t where t.category_id = c.id),
        post_count = (select count(*) from posts p join threads t on t.id = p.thread_id where t.category_id = c.id)`);
    await db.execute(sql`
      update article_categories ac set article_count = (select count(*) from articles a where a.category_id = ac.id)`);
    await db.execute(sql`
      update articles a set
        like_count = (select count(*) from article_votes x where x.article_id = a.id and x.value = 1),
        dislike_count = (select count(*) from article_votes x where x.article_id = a.id and x.value = -1),
        comment_count = (select count(*) from article_comments c where c.article_id = a.id),
        image_count = (select count(*) from article_images i where i.article_id = a.id),
        video_count = (select count(*) from article_videos v where v.article_id = a.id)`);
    await db.execute(sql`
      update article_comments c set
        like_count = (select count(*) from article_comment_votes x where x.comment_id = c.id and x.value = 1),
        dislike_count = (select count(*) from article_comment_votes x where x.comment_id = c.id and x.value = -1)`);
    await db.execute(sql`
      update article_tags t set article_count = (select count(*) from article_tag_links l where l.tag_id = t.id)`);
    return ok(reply);
  });
}
