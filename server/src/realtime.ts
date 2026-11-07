import type { Server as HttpServer } from "node:http";
import { eq, or } from "drizzle-orm";
import { Server, type Socket } from "socket.io";
import { isStaff, SESSION_COOKIE, userFromToken } from "./auth.js";
import { db } from "./db/index.js";
import { supportConversations } from "./db/schema.js";

export const GUEST_COOKIE = "ctc_guest";

let io: Server | null = null;

interface Presence {
  userId: number | null;
  username: string | null;
}

const presence = new Map<string, Presence>();
let onlineTimer: NodeJS.Timeout | null = null;

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    try {
      out[name] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      out[name] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

export function getOnline() {
  const members = new Map<number, string>();
  let guests = 0;
  for (const p of presence.values()) {
    if (p.userId !== null && p.username) members.set(p.userId, p.username);
    else guests += 1;
  }
  return {
    members: members.size,
    guests,
    total: members.size + guests,
    usernames: [...members.values()].slice(0, 50),
  };
}

function scheduleOnlineBroadcast() {
  if (onlineTimer || !io) return;
  onlineTimer = setTimeout(() => {
    onlineTimer = null;
    io?.emit("online", getOnline());
  }, 2000);
}

async function joinSupportRooms(socket: Socket, userId: number | null, guestKey: string | undefined) {
  const conds = [];
  if (userId !== null) conds.push(eq(supportConversations.userId, userId));
  if (guestKey) conds.push(eq(supportConversations.guestKey, guestKey));
  if (!conds.length) return;
  const rows = await db.select({ id: supportConversations.id }).from(supportConversations).where(or(...conds));
  for (const r of rows) socket.join(`sup:${r.id}`);
}

export function initRealtime(server: HttpServer) {
  io = new Server(server, { path: "/socket.io", serveClient: false, cors: { origin: false } });

  io.on("connection", async (socket) => {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    let user = null;
    try {
      user = await userFromToken(cookies[SESSION_COOKIE]);
    } catch {
      user = null;
    }
    const guestKey = cookies[GUEST_COOKIE];
    presence.set(socket.id, { userId: user?.id ?? null, username: user?.username ?? null });
    scheduleOnlineBroadcast();
    socket.emit("online", getOnline());

    if (user) socket.join(`user:${user.id}`);
    if (isStaff(user)) socket.join("staff");
    joinSupportRooms(socket, user?.id ?? null, guestKey).catch(() => {});

    socket.on("chat:join", (channelId: unknown) => {
      if (typeof channelId !== "number" || !Number.isInteger(channelId)) return;
      for (const room of socket.rooms) if (room.startsWith("ch:")) socket.leave(room);
      socket.join(`ch:${channelId}`);
    });

    socket.on("support:join", () => {
      joinSupportRooms(socket, user?.id ?? null, guestKey).catch(() => {});
    });

    socket.on("disconnect", () => {
      presence.delete(socket.id);
      scheduleOnlineBroadcast();
    });
  });
  return io;
}

export function emitTo(room: string, event: string, payload: unknown) {
  io?.to(room).emit(event, payload);
}

export async function closeRealtime() {
  if (onlineTimer) clearTimeout(onlineTimer);
  onlineTimer = null;
  presence.clear();
  // io.close() would also close the HTTP server, which Fastify closes itself.
  io?.disconnectSockets(true);
  io?.engine.close();
  io = null;
}
