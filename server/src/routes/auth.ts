import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createSession,
  destroySession,
  hashPassword,
  profileUser,
  requireActive,
  requireUser,
  verifyPassword,
} from "../auth.js";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { sessions, users } from "../db/schema.js";
import { badRequest, ok, parse } from "../http.js";
import { removeImage, storeImage } from "../media.js";

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Tên đăng nhập cần ít nhất 3 ký tự.")
  .max(20, "Tên đăng nhập tối đa 20 ký tự.")
  .regex(/^[a-zA-Z0-9_.]+$/, "Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm và gạch dưới.");
const passwordSchema = z.string().min(6, "Mật khẩu cần ít nhất 6 ký tự.").max(100, "Mật khẩu quá dài.");

const credentials = z.object({ username: usernameSchema, password: passwordSchema });
const loginBody = z.object({ username: z.string().trim().min(1).max(32), password: z.string().min(1).max(100) });

export default async function authRoutes(app: FastifyInstance) {
  app.get("/api/auth/me", async (req) => ({ user: req.user ? profileUser(req.user) : null }));

  app.post(
    "/api/auth/register",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const body = parse(credentials, req.body);
      const lower = body.username.toLowerCase();
      const exists = await db.select({ id: users.id }).from(users).where(eq(users.usernameLower, lower)).limit(1);
      if (exists.length) throw badRequest("Tên đăng nhập đã có người dùng.");
      const [user] = await db
        .insert(users)
        .values({ username: body.username, usernameLower: lower, passwordHash: await hashPassword(body.password) })
        .returning();
      await createSession(req, reply, user.id);
      return { user: profileUser(user) };
    },
  );

  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } },
    async (req, reply) => {
      const body = parse(loginBody, req.body);
      const [user] = await db.select().from(users).where(eq(users.usernameLower, body.username.toLowerCase())).limit(1);
      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        throw badRequest("Sai tên đăng nhập hoặc mật khẩu.");
      }
      await createSession(req, reply, user.id);
      return { user: profileUser(user) };
    },
  );

  app.post("/api/auth/logout", async (req, reply) => {
    await destroySession(req, reply);
    return ok(reply);
  });

  app.post(
    "/api/auth/password",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const user = requireUser(req);
      const body = parse(z.object({ current: z.string().min(1).max(100), next: passwordSchema }), req.body);
      if (!(await verifyPassword(body.current, user.passwordHash))) throw badRequest("Mật khẩu hiện tại không đúng.");
      await db.update(users).set({ passwordHash: await hashPassword(body.next) }).where(eq(users.id, user.id));
      await db.delete(sessions).where(eq(sessions.userId, user.id));
      await createSession(req, reply, user.id);
      return ok(reply);
    },
  );

  app.patch("/api/me", async (req) => {
    const user = requireActive(req);
    const body = parse(z.object({ bio: z.string().trim().max(500, "Giới thiệu tối đa 500 ký tự.") }), req.body);
    const [updated] = await db.update(users).set({ bio: body.bio }).where(eq(users.id, user.id)).returning();
    return { user: profileUser(updated) };
  });

  app.post("/api/me/avatar", async (req) => {
    const user = requireActive(req);
    const file = await req.file({ limits: { fileSize: config.maxUploadMb * 1024 * 1024 } });
    if (!file) throw badRequest("Chưa chọn ảnh.");
    const stored = await storeImage("avatars", await file.toBuffer());
    const [updated] = await db.update(users).set({ avatarKey: stored.key }).where(eq(users.id, user.id)).returning();
    if (user.avatarKey) await removeImage("avatars", user.avatarKey);
    return { user: profileUser(updated) };
  });
}
