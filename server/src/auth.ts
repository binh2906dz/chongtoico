import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.js";
import { db } from "./db/index.js";
import { sessions, users, type User } from "./db/schema.js";
import { forbidden, unauthorized } from "./http.js";

export type { User };

export const SESSION_COOKIE = "ctc_sid";
export const ROLES = ["member", "mod", "admin"] as const;
export type Role = (typeof ROLES)[number];

declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
  }
}

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function createSession(req: FastifyRequest, reply: FastifyReply, userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + config.sessionDays * 86400_000);
  await db.insert(sessions).values({
    tokenHash: sha256(token),
    userId,
    ip: req.ip.slice(0, 64),
    userAgent: (req.headers["user-agent"] || "").slice(0, 300),
    expiresAt,
  });
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    expires: expiresAt,
  });
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function userFromToken(token: string | undefined): Promise<User | null> {
  if (!token || token.length > 100) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const user = rows[0]?.user ?? null;
  if (user && Date.now() - user.lastSeenAt.getTime() > 5 * 60_000) {
    const now = new Date();
    user.lastSeenAt = now;
    await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, user.id));
  }
  return user;
}

export function isBanned(user: Pick<User, "bannedAt" | "bannedUntil">): boolean {
  if (!user.bannedAt) return false;
  return !user.bannedUntil || user.bannedUntil.getTime() > Date.now();
}

export const isStaff = (user: User | null) => !!user && (user.role === "admin" || user.role === "mod");
export const isAdmin = (user: User | null) => !!user && user.role === "admin";

export function requireUser(req: FastifyRequest): User {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function requireActive(req: FastifyRequest): User {
  const user = requireUser(req);
  if (isBanned(user)) throw forbidden("Tài khoản của bạn đang bị khoá, không thể thực hiện thao tác này.");
  return user;
}

export function requireStaff(req: FastifyRequest): User {
  const user = requireUser(req);
  if (!isStaff(user)) throw forbidden();
  return user;
}

export function requireAdmin(req: FastifyRequest): User {
  const user = requireUser(req);
  if (!isAdmin(user)) throw forbidden();
  return user;
}

export const avatarUrl = (key: string | null) => (key ? `/media/u/${key}.webp` : null);

export function publicUser(u: User) {
  return {
    id: u.id,
    username: u.username,
    avatarUrl: avatarUrl(u.avatarKey),
    role: u.role,
    isBanned: isBanned(u),
    createdAt: u.createdAt,
  };
}

export function profileUser(u: User) {
  return {
    ...publicUser(u),
    bio: u.bio,
    threadCount: u.threadCount,
    postCount: u.postCount,
    likeCount: u.likeCount,
    messageCount: u.messageCount,
    lastSeenAt: u.lastSeenAt,
    banReason: isBanned(u) ? u.banReason : null,
    bannedUntil: isBanned(u) ? u.bannedUntil : null,
  };
}

export const authorColumns = {
  id: users.id,
  username: users.username,
  avatarKey: users.avatarKey,
  role: users.role,
  bannedAt: users.bannedAt,
  bannedUntil: users.bannedUntil,
};

export type AuthorRow = { id: number; username: string; avatarKey: string | null; role: string; bannedAt: Date | null; bannedUntil: Date | null };

export function author(row: AuthorRow | null) {
  if (!row) return null;
  return { id: row.id, username: row.username, avatarUrl: avatarUrl(row.avatarKey), role: row.role, isBanned: isBanned(row) };
}
