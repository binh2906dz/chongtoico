import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { articleImages, articles } from "../db/schema.js";
import { forbidden, notFound } from "../http.js";
import { ensureVariant, mediaPath, VARIANTS, type MediaKind, type Variant } from "../media.js";

const KINDS: Record<string, MediaKind> = { a: "albums", u: "avatars", p: "posts", t: "thumbs", b: "ads" };
const FILE_RE = /^([a-f0-9]{32})(?:_([tsm]))?\.webp$/;

export default async function mediaRoutes(app: FastifyInstance) {
  app.get<{ Params: { kind: string; file: string } }>("/media/:kind/:file", async (req, reply) => {
    const kind = KINDS[req.params.kind];
    const match = FILE_RE.exec(req.params.file);
    if (!kind || !match) throw notFound();
    const suffix = match[2];
    if (suffix === "t" && kind !== "albums") throw notFound();
    if ((suffix === "s" || suffix === "m") && !VARIANTS[suffix].kinds.includes(kind)) throw notFound();

    let cache = "public, max-age=31536000, immutable";
    if (kind === "albums") {
      const [row] = await db
        .select({ visibility: articles.visibility })
        .from(articleImages)
        .innerJoin(articles, eq(articles.id, articleImages.articleId))
        .where(eq(articleImages.fileKey, match[1]))
        .limit(1);
      if (!row) throw notFound();
      if (row.visibility === "members") {
        if (!req.user) throw forbidden("Bài viết chỉ dành cho thành viên.");
        cache = "private, max-age=86400";
      }
    }

    let file: string | null = mediaPath(kind, req.params.file);
    if (suffix === "s" || suffix === "m") {
      file = await ensureVariant(kind, match[1], suffix as Variant);
      if (!file) throw notFound();
    } else {
      try {
        await stat(file);
      } catch {
        throw notFound();
      }
    }
    reply.header("Content-Type", "image/webp").header("Cache-Control", cache).header("X-Content-Type-Options", "nosniff");
    return reply.send(createReadStream(file));
  });
}
