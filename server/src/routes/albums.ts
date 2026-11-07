import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { author, authorColumns, requireStaff } from "../auth.js";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { albumImages, albums, users } from "../db/schema.js";
import { badRequest, idParam, notFound, ok, parse } from "../http.js";
import { albumImageUrl, removeImage, storeImage } from "../media.js";

const PER_PAGE = 24;

const albumBody = z.object({
  title: z.string().trim().min(2, "Tên album cần ít nhất 2 ký tự.").max(150),
  description: z.string().trim().max(1000).default(""),
  visibility: z.enum(["public", "members"]).default("public"),
  isHot: z.boolean().default(false),
});

const viewSeen = new Map<string, number>();
function countView(ip: string, id: number) {
  const key = `${ip}:${id}`;
  const now = Date.now();
  if (now - (viewSeen.get(key) ?? 0) < 30 * 60_000) return false;
  if (viewSeen.size > 50_000) viewSeen.clear();
  viewSeen.set(key, now);
  return true;
}

function albumSelect() {
  return db
    .select({
      id: albums.id,
      title: albums.title,
      description: albums.description,
      visibility: albums.visibility,
      isHot: albums.isHot,
      imageCount: albums.imageCount,
      viewCount: albums.viewCount,
      coverImageId: albums.coverImageId,
      createdAt: albums.createdAt,
      coverKey: albumImages.fileKey,
      author: authorColumns,
    })
    .from(albums)
    .innerJoin(users, eq(users.id, albums.userId))
    .leftJoin(albumImages, eq(albumImages.id, albums.coverImageId))
    .$dynamic();
}

type AlbumRow = Awaited<ReturnType<ReturnType<typeof albumSelect>["execute"]>>[number];

function mapAlbum(row: AlbumRow, loggedIn: boolean) {
  const locked = row.visibility === "members" && !loggedIn;
  const { coverKey, ...rest } = row;
  return {
    ...rest,
    author: author(row.author),
    locked,
    coverUrl: coverKey && !locked ? albumImageUrl(coverKey, true) : null,
  };
}

export async function hotAlbums(loggedIn: boolean, limit: number) {
  const rows = await albumSelect().where(eq(albums.isHot, true)).orderBy(desc(albums.createdAt)).limit(limit);
  return rows.map((r) => mapAlbum(r, loggedIn));
}

async function getAlbum(id: number) {
  const [album] = await db.select().from(albums).where(eq(albums.id, id)).limit(1);
  if (!album) throw notFound("Album không tồn tại.");
  return album;
}

export default async function albumRoutes(app: FastifyInstance) {
  app.get("/api/albums", async (req) => {
    const q = parse(
      z.object({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        sort: z.enum(["new", "views"]).default("new"),
        hot: z.enum(["0", "1"]).default("0"),
      }),
      req.query,
    );
    const where = q.hot === "1" ? eq(albums.isHot, true) : undefined;
    const [{ total }] = await db.select({ total: count() }).from(albums).where(where);
    const rows = await albumSelect()
      .where(where)
      .orderBy(q.sort === "views" ? desc(albums.viewCount) : desc(albums.createdAt), desc(albums.id))
      .limit(PER_PAGE)
      .offset((q.page - 1) * PER_PAGE);
    return {
      albums: rows.map((r) => mapAlbum(r, !!req.user)),
      page: q.page,
      totalPages: Math.max(1, Math.ceil(total / PER_PAGE)),
    };
  });

  app.get("/api/albums/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const [row] = await albumSelect().where(eq(albums.id, id)).limit(1);
    if (!row) throw notFound("Album không tồn tại.");
    if (countView(req.ip, id)) {
      await db.update(albums).set({ viewCount: sql`${albums.viewCount} + 1` }).where(eq(albums.id, id));
      row.viewCount += 1;
    }
    const album = mapAlbum(row, !!req.user);
    const images = album.locked
      ? []
      : (await db.select().from(albumImages).where(eq(albumImages.albumId, id)).orderBy(asc(albumImages.sortOrder), asc(albumImages.id))).map(
          (img) => ({
            id: img.id,
            width: img.width,
            height: img.height,
            url: albumImageUrl(img.fileKey),
            thumbUrl: albumImageUrl(img.fileKey, true),
          }),
        );
    return { album, images };
  });

  app.post("/api/albums", async (req) => {
    const user = requireStaff(req);
    const body = parse(albumBody, req.body);
    const [album] = await db.insert(albums).values({ ...body, userId: user.id }).returning();
    return { album };
  });

  app.patch("/api/albums/:id", async (req) => {
    requireStaff(req);
    const { id } = parse(idParam, req.params);
    const body = parse(albumBody.partial().extend({ coverImageId: z.number().int().positive().optional() }), req.body);
    await getAlbum(id);
    if (body.coverImageId !== undefined) {
      const [img] = await db
        .select({ id: albumImages.id })
        .from(albumImages)
        .where(and(eq(albumImages.id, body.coverImageId), eq(albumImages.albumId, id)))
        .limit(1);
      if (!img) throw badRequest("Ảnh bìa không thuộc album này.");
    }
    const [album] = await db.update(albums).set(body).where(eq(albums.id, id)).returning();
    return { album };
  });

  app.delete("/api/albums/:id", async (req, reply) => {
    requireStaff(req);
    const { id } = parse(idParam, req.params);
    await getAlbum(id);
    const images = await db.select({ fileKey: albumImages.fileKey }).from(albumImages).where(eq(albumImages.albumId, id));
    await db.delete(albums).where(eq(albums.id, id));
    for (const img of images) await removeImage("albums", img.fileKey);
    return ok(reply);
  });

  app.post("/api/albums/:id/images", async (req) => {
    requireStaff(req);
    const { id } = parse(idParam, req.params);
    const album = await getAlbum(id);
    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`coalesce(max(${albumImages.sortOrder}), 0)::int` })
      .from(albumImages)
      .where(eq(albumImages.albumId, id));
    let order = maxOrder;
    const added: { id: number; url: string }[] = [];
    const parts = req.files({ limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 50 } });
    for await (const part of parts) {
      const stored = await storeImage("albums", await part.toBuffer());
      order += 1;
      const [img] = await db
        .insert(albumImages)
        .values({ albumId: id, fileKey: stored.key, width: stored.width, height: stored.height, sortOrder: order })
        .returning();
      added.push({ id: img.id, url: albumImageUrl(img.fileKey) });
    }
    if (!added.length) throw badRequest("Chưa chọn ảnh.");
    await db
      .update(albums)
      .set({
        imageCount: sql`${albums.imageCount} + ${added.length}`,
        ...(album.coverImageId === null && { coverImageId: added[0].id }),
      })
      .where(eq(albums.id, id));
    return { added };
  });

  app.delete("/api/albums/:id/images/:imageId", async (req, reply) => {
    requireStaff(req);
    const { id, imageId } = parse(
      z.object({ id: z.coerce.number().int().positive(), imageId: z.coerce.number().int().positive() }),
      req.params,
    );
    const album = await getAlbum(id);
    const [img] = await db
      .delete(albumImages)
      .where(and(eq(albumImages.id, imageId), eq(albumImages.albumId, id)))
      .returning();
    if (!img) throw notFound("Ảnh không tồn tại.");
    let coverImageId = album.coverImageId;
    if (coverImageId === imageId) {
      const [next] = await db
        .select({ id: albumImages.id })
        .from(albumImages)
        .where(eq(albumImages.albumId, id))
        .orderBy(asc(albumImages.sortOrder))
        .limit(1);
      coverImageId = next?.id ?? null;
    }
    await db
      .update(albums)
      .set({ imageCount: sql`greatest(${albums.imageCount} - 1, 0)`, coverImageId })
      .where(eq(albums.id, id));
    await removeImage("albums", img.fileKey);
    return ok(reply);
  });
}
