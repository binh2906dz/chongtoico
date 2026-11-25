import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import fastifyCookie from "@fastify/cookie";
import fastifyMultipart from "@fastify/multipart";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyError } from "fastify";
import { SESSION_COOKIE, userFromToken } from "./auth.js";
import { config } from "./config.js";
import { HttpError } from "./http.js";
import { VIDEO_DIR } from "./media.js";
import adminRoutes from "./routes/admin.js";
import articleRoutes, { membersOnlyKeys } from "./routes/articles.js";
import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";
import followRoutes from "./routes/follow.js";
import forumRoutes from "./routes/forum.js";
import mediaRoutes from "./routes/media.js";
import memberRoutes from "./routes/members.js";
import notificationRoutes from "./routes/notifications.js";
import siteRoutes from "./routes/site.js";
import supportRoutes from "./routes/support.js";
import telegramRoutes from "./routes/telegram.js";
import telegramAdminRoutes from "./routes/telegramAdmin.js";
import systemRoutes from "./routes/system.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "ctc";

export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: config.logLevel },
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024,
  });

  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, { limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 50 } });
  await app.register(fastifyRateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({ statusCode: 429, error: "Bạn thao tác quá nhanh, vui lòng thử lại sau." }),
  });

  app.decorateRequest("user", null);

  // A POST without a body is legal ("fire and forget"). Fastify would answer
  // 415 because the content type is missing, so an empty body is accepted.
  app.addContentTypeParser("*", { parseAs: "string" }, (_req, body, done) => {
    const raw = typeof body === "string" ? body.trim() : "";
    if (!raw) return done(null, undefined);
    try {
      done(null, JSON.parse(raw));
    } catch {
      done(null, raw);
    }
  });

  app.addHook("onRequest", async (req) => {
    req.user = null;
    const url = req.url;
    if (!url.startsWith("/api/") && !url.startsWith("/media/")) return;
    if (url.startsWith("/media/v/")) {
      const key = /^\/media\/v\/([a-f0-9]{32})\./.exec(url)?.[1];
      if (key && membersOnlyKeys.has(key)) {
        req.user = await userFromToken(req.cookies[SESSION_COOKIE]);
        if (!req.user) throw new HttpError(403, "Video chỉ dành cho thành viên.");
      }
      return;
    }
    if (url.startsWith("/api/") && !SAFE_METHODS.has(req.method) && req.headers[CSRF_HEADER] !== CSRF_VALUE) {
      // The bot service is a server-to-server client: it authenticates with
      // X-Bot-Secret, not with the browser CSRF header.
      if (!url.startsWith("/api/bot/")) throw new HttpError(403, "Yêu cầu không hợp lệ.");
    }
    req.user = await userFromToken(req.cookies[SESSION_COOKIE]);
  });

  app.setErrorHandler((err: FastifyError | HttpError, req, reply) => {
    const status = err.statusCode ?? 500;
    if (err instanceof HttpError || (status >= 400 && status < 500)) {
      let message = err.message;
      if (status === 413 && !(err instanceof HttpError)) message = `File quá lớn (tối đa ${config.maxUploadMb} MB).`;
      if (status === 429 && "error" in err) message = String((err as { error?: string }).error ?? message);
      return reply.status(status).send({ error: message });
    }
    req.log.error(err);
    return reply.status(500).send({ error: "Lỗi máy chủ, vui lòng thử lại sau." });
  });

  app.get("/healthz", { config: { rateLimit: false } }, async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(forumRoutes);
  await app.register(chatRoutes);
  await app.register(memberRoutes);
  await app.register(supportRoutes);
  await app.register(adminRoutes);
  await app.register(articleRoutes);
  await app.register(followRoutes);
  await app.register(notificationRoutes);
  await app.register(siteRoutes);
  await app.register(mediaRoutes);
  await app.register(telegramRoutes);
  await app.register(telegramAdminRoutes);
  await app.register(systemRoutes);

  mkdirSync(VIDEO_DIR(), { recursive: true });
  await app.register(fastifyStatic, {
    root: VIDEO_DIR(),
    prefix: "/media/v/",
    decorateReply: false,
    index: false,
    allowedPath: (pathName) => !pathName.endsWith(".part"),
    setHeaders(res, filePath) {
      const key = path.basename(filePath).split(".")[0];
      res.header("Cache-Control", membersOnlyKeys.has(key) ? "private, max-age=86400" : "public, max-age=31536000, immutable");
      res.header("X-Content-Type-Options", "nosniff");
    },
  });

  const indexFile = path.join(config.publicDir, "index.html");
  const hasFrontend = existsSync(indexFile);
  if (hasFrontend) {
    // wildcard: false registers one route per file found at startup (dist is rebuilt only on deploy).
    await app.register(fastifyStatic, {
      root: config.publicDir,
      wildcard: false,
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.header("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    });
  }

  app.setNotFoundHandler((req, reply) => {
    const url = req.url;
    const isApi = url.startsWith("/api/") || url.startsWith("/media/") || url.startsWith("/socket.io");
    if (req.method === "GET" && !isApi && hasFrontend) {
      return reply.header("Cache-Control", "no-cache").sendFile("index.html");
    }
    return reply.status(404).send({ error: "Không tìm thấy." });
  });

  return app;
}
