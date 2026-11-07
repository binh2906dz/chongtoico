import { randomBytes } from "node:crypto";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { author, authorColumns, requireStaff } from "../auth.js";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { supportConversations, supportMessages, users } from "../db/schema.js";
import { idParam, notFound, parse } from "../http.js";
import { emitTo, GUEST_COOKIE } from "../realtime.js";

const contentSchema = z.string().trim().min(1, "Tin nhắn trống.").max(2000, "Tin nhắn tối đa 2000 ký tự.");

function guestKey(req: FastifyRequest, reply: FastifyReply, create: boolean): string | null {
  const existing = req.cookies[GUEST_COOKIE];
  if (existing && /^[a-f0-9]{48}$/.test(existing)) return existing;
  if (!create) return null;
  const key = randomBytes(24).toString("hex");
  reply.setCookie(GUEST_COOKIE, key, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    maxAge: 365 * 86400,
  });
  return key;
}

async function findConversation(req: FastifyRequest, reply: FastifyReply, create: boolean) {
  if (req.user) {
    const [conv] = await db
      .select()
      .from(supportConversations)
      .where(eq(supportConversations.userId, req.user.id))
      .orderBy(desc(supportConversations.id))
      .limit(1);
    return { conv: conv ?? null, owner: { userId: req.user.id, guestKey: null as string | null } };
  }
  const key = guestKey(req, reply, create);
  if (!key) return { conv: null, owner: { userId: null, guestKey: null } };
  const [conv] = await db
    .select()
    .from(supportConversations)
    .where(eq(supportConversations.guestKey, key))
    .orderBy(desc(supportConversations.id))
    .limit(1);
  return { conv: conv ?? null, owner: { userId: null as number | null, guestKey: key as string | null } };
}

async function listMessages(conversationId: number) {
  const rows = await db
    .select({
      id: supportMessages.id,
      fromStaff: supportMessages.fromStaff,
      content: supportMessages.content,
      createdAt: supportMessages.createdAt,
      staff: authorColumns,
    })
    .from(supportMessages)
    .leftJoin(users, eq(users.id, supportMessages.staffUserId))
    .where(eq(supportMessages.conversationId, conversationId))
    .orderBy(asc(supportMessages.id))
    .limit(500);
  return rows.map((m) => ({ ...m, staff: author(m.staff) }));
}

export default async function supportRoutes(app: FastifyInstance) {
  app.get("/api/support/conversation", async (req, reply) => {
    const { conv } = await findConversation(req, reply, true);
    if (!conv) return { conversation: null, messages: [] };
    if (conv.unreadUser) await db.update(supportConversations).set({ unreadUser: 0 }).where(eq(supportConversations.id, conv.id));
    return { conversation: { ...conv, unreadUser: 0 }, messages: await listMessages(conv.id) };
  });

  app.post(
    "/api/support/messages",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = parse(z.object({ content: contentSchema, guestName: z.string().trim().max(60).optional() }), req.body);
      let { conv, owner } = await findConversation(req, reply, true);
      if (!conv) {
        [conv] = await db
          .insert(supportConversations)
          .values({ userId: owner.userId, guestKey: owner.guestKey, guestName: req.user ? null : body.guestName || null })
          .returning();
      }
      const [msg] = await db.insert(supportMessages).values({ conversationId: conv.id, content: body.content }).returning();
      await db
        .update(supportConversations)
        .set({ status: "open", unreadStaff: sql`${supportConversations.unreadStaff} + 1`, lastMessageAt: msg.createdAt })
        .where(eq(supportConversations.id, conv.id));
      const payload = { conversationId: conv.id, message: { ...msg, staff: null } };
      emitTo(`sup:${conv.id}`, "support:message", payload);
      emitTo("staff", "support:message", payload);
      return payload;
    },
  );

  app.get("/api/admin/support", async (req) => {
    requireStaff(req);
    const { status } = parse(z.object({ status: z.enum(["open", "closed", "all"]).default("open") }), req.query);
    const last = db
      .selectDistinctOn([supportMessages.conversationId], {
        conversationId: supportMessages.conversationId,
        content: supportMessages.content,
        fromStaff: supportMessages.fromStaff,
      })
      .from(supportMessages)
      .orderBy(supportMessages.conversationId, desc(supportMessages.id))
      .as("last_msg");
    const rows = await db
      .select({
        id: supportConversations.id,
        status: supportConversations.status,
        guestName: supportConversations.guestName,
        unreadStaff: supportConversations.unreadStaff,
        lastMessageAt: supportConversations.lastMessageAt,
        createdAt: supportConversations.createdAt,
        user: authorColumns,
        lastContent: last.content,
        lastFromStaff: last.fromStaff,
      })
      .from(supportConversations)
      .leftJoin(users, eq(users.id, supportConversations.userId))
      .leftJoin(last, eq(last.conversationId, supportConversations.id))
      .where(status === "all" ? undefined : eq(supportConversations.status, status))
      .orderBy(desc(supportConversations.lastMessageAt))
      .limit(200);
    return { conversations: rows.map((r) => ({ ...r, user: author(r.user) })) };
  });

  app.get("/api/admin/support/:id", async (req) => {
    requireStaff(req);
    const { id } = parse(idParam, req.params);
    const [row] = await db
      .select({ conv: supportConversations, user: authorColumns })
      .from(supportConversations)
      .leftJoin(users, eq(users.id, supportConversations.userId))
      .where(eq(supportConversations.id, id))
      .limit(1);
    if (!row) throw notFound("Hội thoại không tồn tại.");
    await db.update(supportConversations).set({ unreadStaff: 0 }).where(eq(supportConversations.id, id));
    const { guestKey: _omit, ...conv } = row.conv;
    void _omit;
    return { conversation: { ...conv, unreadStaff: 0, user: author(row.user) }, messages: await listMessages(id) };
  });

  app.post("/api/admin/support/:id/messages", async (req) => {
    const staff = requireStaff(req);
    const { id } = parse(idParam, req.params);
    const { content } = parse(z.object({ content: contentSchema }), req.body);
    const [conv] = await db.select().from(supportConversations).where(eq(supportConversations.id, id)).limit(1);
    if (!conv) throw notFound("Hội thoại không tồn tại.");
    const [msg] = await db
      .insert(supportMessages)
      .values({ conversationId: id, content, fromStaff: true, staffUserId: staff.id })
      .returning();
    await db
      .update(supportConversations)
      .set({ unreadUser: sql`${supportConversations.unreadUser} + 1`, lastMessageAt: msg.createdAt })
      .where(eq(supportConversations.id, id));
    const payload = { conversationId: id, message: { ...msg, staff: author({ ...staff }) } };
    emitTo(`sup:${id}`, "support:message", payload);
    emitTo("staff", "support:message", payload);
    return payload;
  });

  app.patch("/api/admin/support/:id", async (req) => {
    requireStaff(req);
    const { id } = parse(idParam, req.params);
    const { status } = parse(z.object({ status: z.enum(["open", "closed"]) }), req.body);
    const [conv] = await db.update(supportConversations).set({ status }).where(eq(supportConversations.id, id)).returning();
    if (!conv) throw notFound("Hội thoại không tồn tại.");
    return { ok: true, status };
  });
}
