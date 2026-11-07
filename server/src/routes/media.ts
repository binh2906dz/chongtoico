import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { albumImages, albums } from "../db/schema.js";
import { forbidden, notFound } from "../http.js";
import { mediaPath, type MediaKind } from "../media.js";

const KINDS: Record<string, MediaKind> = { a: "albums", u: "avatars", p: "posts" };
const FILE_RE = /^([a-f0-9]{32})(_t)?\.webp$/;

export default async function mediaRoutes(app: FastifyInstance) {
  app.get<{ Params: { kind: string; file: string } }>("/media/:kind/:file", async (req, reply) => {
    const kind = KINDS[req.params.kind];
    const match = FILE_RE.exec(req.params.file);
    if (!kind || !match || (match[2] && kind !== "albums")) throw notFound();

    let cache = "public, max-age=31536000, immutable";
    if (kind === "albums") {
      const [row] = await db
        .select({ visibility: albums.visibility })
        .from(albumImages)
        .innerJoin(albums, eq(albums.id, albumImages.albumId))
        .where(eq(albumImages.fileKey, match[1]))
        .limit(1);
      if (!row) throw notFound();
      if (row.visibility === "members") {
        if (!req.user) throw forbidden("Album chỉ dành cho thành viên.");
        cache = "private, max-age=86400";
      }
    }

    const file = mediaPath(kind, req.params.file);
    try {
      await stat(file);
    } catch {
      throw notFound();
    }
    reply.header("Content-Type", "image/webp").header("Cache-Control", cache).header("X-Content-Type-Options", "nosniff");
    return reply.send(createReadStream(file));
  });
}
