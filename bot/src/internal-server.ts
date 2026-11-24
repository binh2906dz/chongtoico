/**
 * Internal HTTP service of the bot.
 *
 * It exposes `POST /internal/verify`, which the web app calls to check the
 * Telegram `initData`. The listener is bound to 127.0.0.1 so nothing from the
 * internet can reach it, and every call must carry the shared secret.
 */

import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { verifyInitData } from "./verifier.js";

/** Compare two secrets without leaking their content through timing. */
export function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface VerifyServerOptions {
  tokens: string[];
  host?: string;
  port?: number;
  /**
   * Check one bot right away. Returns null when the bot is unknown, or the
   * state of the bot together with the error message.
   */
  checkBot?: (botId: string) => Promise<{ status: string; error?: string | null } | null> | { status: string; error?: string | null } | null;
}

/** Start the internal verify server. */
export async function startVerifyServer(options: VerifyServerOptions) {
  const app = Fastify({ logger: false });

  app.post("/internal/verify", async (req, reply) => {
    const header = req.headers["x-bot-secret"];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!secretMatches(provided, config.apiSecret)) {
      return reply.code(401).send({ ok: false, error: "Sai khoá dịch vụ." });
    }
    const body = (req.body ?? {}) as { initData?: unknown };
    if (typeof body.initData !== "string") {
      return reply.code(400).send({ ok: false, error: "Thiếu initData." });
    }
    const result = verifyInitData(body.initData, options.tokens);
    if (!result.ok) return reply.code(200).send(result);
    // Never echo the signed payload back to the caller.
    return reply.code(200).send({
      ok: true,
      telegramId: result.telegramId,
      username: result.username,
      firstName: result.firstName,
      authDate: result.authDate,
    });
  });

  app.get("/internal/health", async () => ({ ok: true, bots: options.tokens.length }));

  /**
   * Ask the bot service to check one bot right away.
   *
   * The web app calls this when an admin presses "Kiểm tra". The service runs
   * getMe and answers with the new state.
   */
  app.post("/internal/check-bot", async (req, reply) => {
    const header = req.headers["x-bot-secret"];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!secretMatches(provided, config.apiSecret)) {
      return reply.code(401).send({ ok: false, error: "Sai khoá dịch vụ." });
    }
    const body = (req.body ?? {}) as { botId?: unknown };
    if (typeof body.botId !== "string" || !body.botId.trim()) {
      return reply.code(400).send({ ok: false, error: "Thiếu botId." });
    }
    const result = (await options.checkBot?.(body.botId)) ?? null;
    if (!result) return reply.code(404).send({ ok: false, error: "Không tìm thấy bot." });
    return { ok: true, ...result };
  });

  const host = options.host ?? config.internalHost;
  const port = options.port ?? config.internalPort;
  await app.listen({ host, port });
  return app;
}
