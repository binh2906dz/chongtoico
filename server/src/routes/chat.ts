import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { author, authorColumns, isStaff, requireActive, requireStaff } from "../auth.js";
import { db } from "../db/index.js";
import { chatChannels, chatMessages, users } from "../db/schema.js";
import { forbidden, HttpError, idParam, notFound, ok, parse } from "../http.js";
import { emitTo } from "../realtime.js";

const lastSent = new Map<number, number>();

function messageSelect() {
  return db
    .select({
      id: chatMessages.id,
      channelId: chatMessages.channelId,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
      author: authorColumns,
    })
    .from(chatMessages)
    .innerJoin(users, eq(users.id, chatMessages.userId))
    .$dynamic();
}

export default async function chatRoutes(app: FastifyInstance) {
  app.get("/api/chat/channels", async () => ({
    channels: await db.select().from(chatChannels).orderBy(asc(chatChannels.sortOrder), asc(chatChannels.id)),
  }));

  app.get("/api/chat/channels/:id/messages", async (req) => {
    const { id } = parse(idParam, req.params);
    const q = parse(
      z.object({
        before: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
      req.query,
    );
    const cond = q.before ? and(eq(chatMessages.channelId, id), lt(chatMessages.id, q.before)) : eq(chatMessages.channelId, id);
    const rows = await messageSelect().where(cond).orderBy(desc(chatMessages.id)).limit(q.limit);
    return { messages: rows.reverse().map((m) => ({ ...m, author: author(m.author) })) };
  });

  app.post(
    "/api/chat/channels/:id/messages",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req) => {
      const user = requireActive(req);
      const { id } = parse(idParam, req.params);
      const { content } = parse(
        z.object({ content: z.string().trim().min(1, "Tin nhắn trống.").max(1000, "Tin nhắn tối đa 1000 ký tự.") }),
        req.body,
      );
      const [channel] = await db.select().from(chatChannels).where(eq(chatChannels.id, id)).limit(1);
      if (!channel) throw notFound("Kênh chat không tồn tại.");
      if (channel.staffOnly && !isStaff(user)) throw forbidden("Chỉ ban quản trị được nhắn trong kênh này.");
      const now = Date.now();
      if (now - (lastSent.get(user.id) ?? 0) < 1000) throw new HttpError(429, "Bạn nhắn nhanh quá, chờ một chút.");
      lastSent.set(user.id, now);
      if (lastSent.size > 10_000) lastSent.clear();

      const [msg] = await db.insert(chatMessages).values({ channelId: id, userId: user.id, content }).returning();
      await db.update(users).set({ messageCount: sql`${users.messageCount} + 1` }).where(eq(users.id, user.id));
      const payload = {
        id: msg.id,
        channelId: id,
        content: msg.content,
        createdAt: msg.createdAt,
        author: author({ ...user }),
      };
      emitTo(`ch:${id}`, "chat:message", payload);
      return { message: payload };
    },
  );

  app.delete("/api/chat/messages/:id", async (req, reply) => {
    requireStaff(req);
    const { id } = parse(idParam, req.params);
    const [msg] = await db.delete(chatMessages).where(eq(chatMessages.id, id)).returning();
    if (!msg) throw notFound("Tin nhắn không tồn tại.");
    emitTo(`ch:${msg.channelId}`, "chat:deleted", { id, channelId: msg.channelId });
    return ok(reply);
  });
}
