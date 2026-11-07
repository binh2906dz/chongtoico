import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { and, asc, count, desc, eq, gte, ilike, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { author, authorColumns, isStaff, requireActive, requireAdmin, requireStaff, requireUser } from "../auth.js";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { users, videoCategories, videoComments, videoHistory, videos, videoViewDays, videoVotes } from "../db/schema.js";
import { badRequest, forbidden, HttpError, idParam, isUniqueViolation, notFound, ok, pageQuery, paginate, parse } from "../http.js";
import {
  looksLikeVideo,
  removeImage,
  removeVideoFile,
  storeImage,
  VIDEO_DIR,
  videoExtFromName,
  videoFileUrl,
  videoThumbUrl,
  type VideoExt,
} from "../media.js";
import { slugSchema } from "./admin.js";

const PER_PAGE = 24;
const COMMENTS_PER_PAGE = 20;
const MB = 1024 * 1024;

export const VIDEO_SORTS = ["today", "new", "best", "hot"] as const;
export type VideoSort = (typeof VIDEO_SORTS)[number];

// View days are counted in Vietnam time (UTC+7).
const vnDay = (daysAgo = 0) => new Date(Date.now() + 7 * 3600_000 - daysAgo * 86400_000).toISOString().slice(0, 10);

const cardColumns = {
  id: videos.id,
  title: videos.title,
  thumbKey: videos.thumbKey,
  duration: videos.duration,
  width: videos.width,
  height: videos.height,
  viewCount: videos.viewCount,
  likeCount: videos.likeCount,
  dislikeCount: videos.dislikeCount,
  commentCount: videos.commentCount,
  createdAt: videos.createdAt,
  category: { id: videoCategories.id, slug: videoCategories.slug, name: videoCategories.name },
};

type CardRow = {
  thumbKey: string | null;
  likeCount: number;
  dislikeCount: number;
} & Record<string, unknown>;

function mapCard<T extends CardRow>(row: T) {
  const { thumbKey, ...rest } = row;
  const votes = row.likeCount + row.dislikeCount;
  return { ...rest, thumbUrl: videoThumbUrl(thumbKey), rating: votes ? Math.round((row.likeCount * 100) / votes) : null };
}

function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

export async function listVideos(opts: {
  sort: VideoSort;
  limit: number;
  offset?: number;
  categoryId?: number;
  q?: string;
  excludeId?: number;
}) {
  const conds: SQL[] = [];
  if (opts.categoryId) conds.push(eq(videos.categoryId, opts.categoryId));
  if (opts.q) conds.push(ilike(videos.title, likePattern(opts.q)));
  if (opts.excludeId) conds.push(ne(videos.id, opts.excludeId));
  const where = conds.length ? and(...conds) : undefined;

  let query = db.select(cardColumns).from(videos).leftJoin(videoCategories, eq(videoCategories.id, videos.categoryId)).$dynamic();
  let order: SQL[];
  if (opts.sort === "today" || opts.sort === "hot") {
    const recent = db
      .select({ videoId: videoViewDays.videoId, n: sql<number>`sum(${videoViewDays.views})::int`.as("n") })
      .from(videoViewDays)
      .where(gte(videoViewDays.day, opts.sort === "today" ? vnDay() : vnDay(6)))
      .groupBy(videoViewDays.videoId)
      .as("recent");
    query = query.leftJoin(recent, eq(recent.videoId, videos.id));
    order = [desc(sql`coalesce(${recent.n}, 0)`), desc(videos.viewCount), desc(videos.id)];
  } else if (opts.sort === "best") {
    order = [
      desc(sql`(${videos.likeCount} + 1.0) / (${videos.likeCount} + ${videos.dislikeCount} + 2)`),
      desc(videos.likeCount),
      desc(videos.viewCount),
      desc(videos.id),
    ];
  } else {
    order = [desc(videos.createdAt), desc(videos.id)];
  }
  const rows = await query
    .where(where)
    .orderBy(...order)
    .limit(opts.limit)
    .offset(opts.offset ?? 0);
  return { rows: rows.map(mapCard), where };
}

export async function listVideoCategories() {
  return db.select().from(videoCategories).orderBy(asc(videoCategories.sortOrder), asc(videoCategories.id));
}

async function findCategory(slug: string | undefined) {
  if (!slug) return null;
  const [cat] = await db.select().from(videoCategories).where(eq(videoCategories.slug, slug)).limit(1);
  if (!cat) throw notFound("Thể loại không tồn tại.");
  return cat;
}

const viewSeen = new Map<string, number>();
function countView(ip: string, id: number) {
  const key = `${ip}:${id}`;
  const now = Date.now();
  if (now - (viewSeen.get(key) ?? 0) < 30 * 60_000) return false;
  if (viewSeen.size > 50_000) viewSeen.clear();
  viewSeen.set(key, now);
  return true;
}

async function getVideo(id: number) {
  const [video] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (!video) throw notFound("Video không tồn tại hoặc đã bị xoá.");
  return video;
}

async function bumpCategory(categoryId: number | null, delta: number) {
  if (!categoryId) return;
  await db
    .update(videoCategories)
    .set({ videoCount: sql`greatest(${videoCategories.videoCount} + ${delta}, 0)` })
    .where(eq(videoCategories.id, categoryId));
}

async function assertCategory(categoryId: number | null | undefined) {
  if (!categoryId) return;
  const [cat] = await db.select({ id: videoCategories.id }).from(videoCategories).where(eq(videoCategories.id, categoryId)).limit(1);
  if (!cat) throw badRequest("Thể loại không tồn tại.");
}

const optionalId = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.coerce.number().int().positive().optional());

const uploadFields = z.object({
  title: z.string().trim().min(2, "Tiêu đề cần ít nhất 2 ký tự.").max(200, "Tiêu đề tối đa 200 ký tự."),
  description: z.string().trim().max(5000, "Mô tả tối đa 5.000 ký tự.").default(""),
  categoryId: optionalId,
  duration: z.coerce.number().min(0).max(172800).default(0),
  width: z.coerce.number().int().min(0).max(20000).default(0),
  height: z.coerce.number().int().min(0).max(20000).default(0),
});

const videoCategoryBody = z.object({
  slug: slugSchema,
  name: z.string().trim().min(2, "Tên thể loại cần ít nhất 2 ký tự.").max(60),
  sortOrder: z.number().int().default(0),
});

export default async function videoRoutes(app: FastifyInstance) {
  app.get("/api/videos/categories", async () => ({ categories: await listVideoCategories() }));

  app.get("/api/videos", async (req) => {
    const q = parse(
      pageQuery.extend({
        sort: z.enum(VIDEO_SORTS).default("new"),
        category: z.string().max(64).optional(),
        q: z.string().trim().max(100).optional(),
      }),
      req.query,
    );
    const cat = await findCategory(q.category);
    const { limit, offset } = paginate(q.page, PER_PAGE);
    const { rows, where } = await listVideos({ sort: q.sort, limit, offset, categoryId: cat?.id, q: q.q || undefined });
    const [{ total }] = await db.select({ total: count() }).from(videos).where(where);
    return { videos: rows, category: cat, page: q.page, totalPages: Math.max(1, Math.ceil(total / PER_PAGE)), total };
  });

  app.get("/api/videos/by-ids", async (req) => {
    const { ids } = parse(z.object({ ids: z.string().max(1000).default("") }), req.query);
    const list = [...new Set(ids.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 100);
    if (!list.length) return { videos: [] };
    const rows = await db
      .select(cardColumns)
      .from(videos)
      .leftJoin(videoCategories, eq(videoCategories.id, videos.categoryId))
      .where(inArray(videos.id, list));
    const byId = new Map(rows.map((r) => [r.id, mapCard(r)]));
    return { videos: list.map((id) => byId.get(id)).filter(Boolean) };
  });

  app.get("/api/videos/history", async (req) => {
    const user = requireUser(req);
    const { page } = parse(pageQuery, req.query);
    const { limit, offset } = paginate(page, PER_PAGE);
    const [[{ total }], rows] = await Promise.all([
      db.select({ total: count() }).from(videoHistory).where(eq(videoHistory.userId, user.id)),
      db
        .select({ ...cardColumns, viewedAt: videoHistory.viewedAt })
        .from(videoHistory)
        .innerJoin(videos, eq(videos.id, videoHistory.videoId))
        .leftJoin(videoCategories, eq(videoCategories.id, videos.categoryId))
        .where(eq(videoHistory.userId, user.id))
        .orderBy(desc(videoHistory.viewedAt))
        .limit(limit)
        .offset(offset),
    ]);
    return { videos: rows.map(mapCard), page, totalPages: Math.max(1, Math.ceil(total / PER_PAGE)) };
  });

  app.delete("/api/videos/history", async (req, reply) => {
    const user = requireUser(req);
    await db.delete(videoHistory).where(eq(videoHistory.userId, user.id));
    return ok(reply);
  });

  app.delete("/api/videos/history/:id", async (req, reply) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    await db.delete(videoHistory).where(and(eq(videoHistory.userId, user.id), eq(videoHistory.videoId, id)));
    return ok(reply);
  });

  app.get("/api/videos/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const [row] = await db
      .select({
        ...cardColumns,
        description: videos.description,
        fileKey: videos.fileKey,
        ext: videos.ext,
        categoryId: videos.categoryId,
        author: authorColumns,
      })
      .from(videos)
      .innerJoin(users, eq(users.id, videos.userId))
      .leftJoin(videoCategories, eq(videoCategories.id, videos.categoryId))
      .where(eq(videos.id, id))
      .limit(1);
    if (!row) throw notFound("Video không tồn tại hoặc đã bị xoá.");

    if (countView(req.ip, id)) {
      await db.update(videos).set({ viewCount: sql`${videos.viewCount} + 1` }).where(eq(videos.id, id));
      await db
        .insert(videoViewDays)
        .values({ videoId: id, day: vnDay(), views: 1 })
        .onConflictDoUpdate({ target: [videoViewDays.videoId, videoViewDays.day], set: { views: sql`${videoViewDays.views} + 1` } });
      row.viewCount += 1;
    }

    let myVote = 0;
    if (req.user) {
      await db
        .insert(videoHistory)
        .values({ userId: req.user.id, videoId: id })
        .onConflictDoUpdate({ target: [videoHistory.userId, videoHistory.videoId], set: { viewedAt: new Date() } });
      const [vote] = await db
        .select({ value: videoVotes.value })
        .from(videoVotes)
        .where(and(eq(videoVotes.videoId, id), eq(videoVotes.userId, req.user.id)))
        .limit(1);
      myVote = vote?.value ?? 0;
    }

    const { fileKey, ext, categoryId, author: authorRow, ...card } = row;
    let { rows: related } = await listVideos({ sort: "today", limit: 12, categoryId: categoryId ?? undefined, excludeId: id });
    if (related.length < 12 && categoryId) {
      const extra = await listVideos({ sort: "today", limit: 12, excludeId: id });
      const seen = new Set(related.map((v) => v.id));
      related = [...related, ...extra.rows.filter((v) => !seen.has(v.id))].slice(0, 12);
    }
    return {
      video: { ...mapCard(card), videoUrl: videoFileUrl(fileKey, ext), author: author(authorRow) },
      myVote,
      related,
    };
  });

  app.post(
    "/api/videos/:id/vote",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
      const user = requireActive(req);
      const { id } = parse(idParam, req.params);
      const { value } = parse(z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) }), req.body);
      await getVideo(id);
      return db.transaction(async (tx) => {
        const [prev] = await tx
          .select({ value: videoVotes.value })
          .from(videoVotes)
          .where(and(eq(videoVotes.videoId, id), eq(videoVotes.userId, user.id)))
          .limit(1);
        const before = prev?.value ?? 0;
        if (value === 0) {
          await tx.delete(videoVotes).where(and(eq(videoVotes.videoId, id), eq(videoVotes.userId, user.id)));
        } else {
          await tx
            .insert(videoVotes)
            .values({ videoId: id, userId: user.id, value })
            .onConflictDoUpdate({ target: [videoVotes.videoId, videoVotes.userId], set: { value } });
        }
        const likeDelta = (value === 1 ? 1 : 0) - (before === 1 ? 1 : 0);
        const dislikeDelta = (value === -1 ? 1 : 0) - (before === -1 ? 1 : 0);
        const [v] = await tx
          .update(videos)
          .set({
            likeCount: sql`greatest(${videos.likeCount} + ${likeDelta}, 0)`,
            dislikeCount: sql`greatest(${videos.dislikeCount} + ${dislikeDelta}, 0)`,
          })
          .where(eq(videos.id, id))
          .returning({ likeCount: videos.likeCount, dislikeCount: videos.dislikeCount });
        const votes = v.likeCount + v.dislikeCount;
        return { ...v, myVote: value, rating: votes ? Math.round((v.likeCount * 100) / votes) : null };
      });
    },
  );

  app.get("/api/videos/:id/comments", async (req) => {
    const { id } = parse(idParam, req.params);
    const { page } = parse(pageQuery, req.query);
    const video = await getVideo(id);
    const { limit, offset } = paginate(page, COMMENTS_PER_PAGE);
    const rows = await db
      .select({ id: videoComments.id, content: videoComments.content, createdAt: videoComments.createdAt, author: authorColumns })
      .from(videoComments)
      .innerJoin(users, eq(users.id, videoComments.userId))
      .where(eq(videoComments.videoId, id))
      .orderBy(desc(videoComments.id))
      .limit(limit)
      .offset(offset);
    return {
      comments: rows.map((r) => ({ ...r, author: author(r.author) })),
      page,
      totalPages: Math.max(1, Math.ceil(video.commentCount / COMMENTS_PER_PAGE)),
      total: video.commentCount,
    };
  });

  app.post(
    "/api/videos/:id/comments",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const user = requireActive(req);
      const { id } = parse(idParam, req.params);
      const { content } = parse(
        z.object({ content: z.string().trim().min(1, "Bình luận không được để trống.").max(2000, "Bình luận tối đa 2.000 ký tự.") }),
        req.body,
      );
      await getVideo(id);
      const [comment] = await db.insert(videoComments).values({ videoId: id, userId: user.id, content }).returning();
      await db.update(videos).set({ commentCount: sql`${videos.commentCount} + 1` }).where(eq(videos.id, id));
      return { comment: { id: comment.id, content: comment.content, createdAt: comment.createdAt, author: author(user) } };
    },
  );

  app.delete("/api/videos/comments/:id", async (req, reply) => {
    const user = requireActive(req);
    const { id } = parse(idParam, req.params);
    const [comment] = await db.select().from(videoComments).where(eq(videoComments.id, id)).limit(1);
    if (!comment) throw notFound("Bình luận không tồn tại.");
    if (comment.userId !== user.id && !isStaff(user)) throw forbidden();
    await db.delete(videoComments).where(eq(videoComments.id, id));
    await db
      .update(videos)
      .set({ commentCount: sql`greatest(${videos.commentCount} - 1, 0)` })
      .where(eq(videos.id, comment.videoId));
    return ok(reply);
  });

  app.get("/api/admin/video-categories", async (req) => {
    requireStaff(req);
    return { categories: await listVideoCategories() };
  });

  app.post("/api/admin/video-categories", async (req) => {
    requireAdmin(req);
    const body = parse(videoCategoryBody, req.body);
    try {
      const [category] = await db.insert(videoCategories).values(body).returning();
      return { category };
    } catch (err) {
      if (isUniqueViolation(err)) throw badRequest("Đường dẫn thể loại đã tồn tại.");
      throw err;
    }
  });

  app.patch("/api/admin/video-categories/:id", async (req) => {
    requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const body = parse(videoCategoryBody.partial(), req.body);
    try {
      const [category] = await db.update(videoCategories).set(body).where(eq(videoCategories.id, id)).returning();
      if (!category) throw notFound("Thể loại không tồn tại.");
      return { category };
    } catch (err) {
      if (isUniqueViolation(err)) throw badRequest("Đường dẫn thể loại đã tồn tại.");
      throw err;
    }
  });

  app.delete("/api/admin/video-categories/:id", async (req, reply) => {
    requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const [category] = await db.delete(videoCategories).where(eq(videoCategories.id, id)).returning();
    if (!category) throw notFound("Thể loại không tồn tại.");
    return ok(reply);
  });

  app.post(
    "/api/admin/videos",
    { bodyLimit: (config.maxVideoMb + 20) * MB, config: { rateLimit: { max: 60, timeWindow: "1 hour" } } },
    async (req) => {
      const user = requireAdmin(req);
      const dir = VIDEO_DIR();
      await mkdir(dir, { recursive: true });
      const fields: Record<string, string> = {};
      const cleanup: string[] = [];
      let thumb: Buffer | null = null;
      let saved: { key: string; ext: VideoExt; tmp: string; size: number } | null = null;
      try {
        const parts = req.parts({ limits: { fileSize: config.maxVideoMb * MB, files: 2, fields: 10, fieldSize: 20_000 } });
        for await (const part of parts) {
          if (part.type === "field") {
            fields[part.fieldname] = String(part.value ?? "");
            continue;
          }
          if (part.fieldname === "thumb") {
            thumb = await part.toBuffer();
            if (thumb.length > config.maxUploadMb * MB) throw badRequest("Ảnh bìa quá lớn.");
            continue;
          }
          if (part.fieldname !== "video" || saved) {
            part.file.resume();
            continue;
          }
          const ext = videoExtFromName(part.filename);
          if (!ext) {
            part.file.resume();
            throw badRequest("Chỉ nhận video định dạng mp4, webm hoặc mov.");
          }
          const key = randomBytes(16).toString("hex");
          const tmp = path.join(dir, `${key}.${ext}.part`);
          cleanup.push(tmp);
          try {
            await pipeline(part.file, createWriteStream(tmp));
          } catch (err) {
            if ((err as { statusCode?: number }).statusCode === 413) throw new HttpError(413, `Video quá lớn (tối đa ${config.maxVideoMb} MB).`);
            throw err;
          }
          if (part.file.truncated) throw new HttpError(413, `Video quá lớn (tối đa ${config.maxVideoMb} MB).`);
          saved = { key, ext, tmp, size: (await stat(tmp)).size };
        }
        if (!saved) throw badRequest("Chưa chọn file video.");

        const head = Buffer.alloc(16);
        const fh = await open(saved.tmp, "r");
        try {
          await fh.read(head, 0, 16, 0);
        } finally {
          await fh.close();
        }
        if (!looksLikeVideo(head, saved.ext)) throw badRequest("File không phải video hợp lệ.");

        const body = parse(uploadFields, fields);
        await assertCategory(body.categoryId);
        const thumbKey = thumb?.length ? (await storeImage("thumbs", thumb)).key : null;
        const finalPath = path.join(dir, `${saved.key}.${saved.ext}`);
        await rename(saved.tmp, finalPath);
        cleanup.push(finalPath);
        const [video] = await db
          .insert(videos)
          .values({
            userId: user.id,
            categoryId: body.categoryId ?? null,
            title: body.title,
            description: body.description,
            fileKey: saved.key,
            ext: saved.ext,
            thumbKey,
            duration: Math.round(body.duration),
            width: body.width,
            height: body.height,
            sizeBytes: saved.size,
          })
          .returning({ id: videos.id });
        cleanup.length = 0;
        await bumpCategory(body.categoryId ?? null, 1);
        return { video };
      } finally {
        for (const file of cleanup) await rm(file, { force: true });
      }
    },
  );

  app.patch("/api/admin/videos/:id", async (req) => {
    requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({
        title: uploadFields.shape.title.optional(),
        description: uploadFields.shape.description.optional(),
        categoryId: z.number().int().positive().nullable().optional(),
      }),
      req.body,
    );
    const video = await getVideo(id);
    if (body.categoryId !== undefined && body.categoryId !== video.categoryId) {
      await assertCategory(body.categoryId);
      await bumpCategory(video.categoryId, -1);
      await bumpCategory(body.categoryId, 1);
    }
    await db.update(videos).set(body).where(eq(videos.id, id));
    return { ok: true };
  });

  app.post("/api/admin/videos/:id/thumb", async (req) => {
    requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const video = await getVideo(id);
    const file = await req.file({ limits: { fileSize: config.maxUploadMb * MB } });
    if (!file) throw badRequest("Chưa chọn ảnh.");
    const stored = await storeImage("thumbs", await file.toBuffer());
    await db.update(videos).set({ thumbKey: stored.key }).where(eq(videos.id, id));
    if (video.thumbKey) await removeImage("thumbs", video.thumbKey);
    return { thumbUrl: videoThumbUrl(stored.key) };
  });

  app.delete("/api/admin/videos/:id", async (req, reply) => {
    requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const video = await getVideo(id);
    await db.delete(videos).where(eq(videos.id, id));
    await bumpCategory(video.categoryId, -1);
    await removeVideoFile(video.fileKey, video.ext);
    if (video.thumbKey) await removeImage("thumbs", video.thumbKey);
    return ok(reply);
  });
}
