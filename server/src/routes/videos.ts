import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, notInArray, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { author, authorColumns, isStaff, requireActive, requireAdmin, requireStaff, requireUser } from "../auth.js";
import { config } from "../config.js";
import { db } from "../db/index.js";
import {
  users,
  videoCategories,
  videoComments,
  videoCommentVotes,
  videoHistory,
  videos,
  videoSaves,
  videoTagLinks,
  videoTags,
  videoViewDays,
  videoVotes,
} from "../db/schema.js";
import { faststart, grabFrame, probeVideo } from "../ffmpeg.js";
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
import { notify } from "../notify.js";
import { slugSchema } from "./admin.js";

const PER_PAGE = 24;
const COMMENTS_PER_PAGE = 20;
const MB = 1024 * 1024;

export const VIDEO_SORTS = ["today", "new", "best", "hot", "week", "random"] as const;
export type VideoSort = (typeof VIDEO_SORTS)[number];
export const SAVE_LISTS = ["favorite", "later"] as const;
export const VISIBILITIES = ["public", "members"] as const;

// View days are counted in Vietnam time (UTC+7).
const vnDay = (daysAgo = 0) => new Date(Date.now() + 7 * 3600_000 - daysAgo * 86400_000).toISOString().slice(0, 10);

/** File keys of members-only videos; checked before /media/v/ serves a file. */
export const membersOnlyKeys = new Set<string>();

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
  visibility: videos.visibility,
  createdAt: videos.createdAt,
  category: { id: videoCategories.id, slug: videoCategories.slug, name: videoCategories.name },
};

type CardRow = {
  thumbKey: string | null;
  likeCount: number;
  dislikeCount: number;
  visibility: string;
} & Record<string, unknown>;

function mapCard<T extends CardRow>(row: T) {
  const { thumbKey, visibility, ...rest } = row;
  const votes = row.likeCount + row.dislikeCount;
  return {
    ...rest,
    thumbUrl: videoThumbUrl(thumbKey),
    membersOnly: visibility === "members",
    rating: votes ? Math.round((row.likeCount * 100) / votes) : null,
  };
}

function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

export function tagSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** "a, b , c" -> unique tag names (2-40 chars, max 15). */
function parseTagNames(input: string) {
  const out = new Map<string, string>();
  for (const raw of input.split(/[,#\n]/)) {
    const name = raw.replace(/\s+/g, " ").trim().slice(0, 40);
    const slug = tagSlug(name);
    if (name.length < 2 || slug.length < 2 || out.has(slug)) continue;
    out.set(slug, name);
    if (out.size >= 15) break;
  }
  return out;
}

async function setVideoTags(videoId: number, input: string) {
  const wanted = parseTagNames(input);
  await db.transaction(async (tx) => {
    const current = await tx
      .select({ id: videoTags.id, slug: videoTags.slug })
      .from(videoTagLinks)
      .innerJoin(videoTags, eq(videoTags.id, videoTagLinks.tagId))
      .where(eq(videoTagLinks.videoId, videoId));
    const removed = current.filter((t) => !wanted.has(t.slug)).map((t) => t.id);
    if (removed.length) {
      await tx.delete(videoTagLinks).where(and(eq(videoTagLinks.videoId, videoId), inArray(videoTagLinks.tagId, removed)));
      await tx
        .update(videoTags)
        .set({ videoCount: sql`greatest(${videoTags.videoCount} - 1, 0)` })
        .where(inArray(videoTags.id, removed));
    }
    const have = new Set(current.map((t) => t.slug));
    for (const [slug, name] of wanted) {
      if (have.has(slug)) continue;
      const [tag] = await tx
        .insert(videoTags)
        .values({ slug, name })
        .onConflictDoUpdate({ target: videoTags.slug, set: { slug } })
        .returning({ id: videoTags.id });
      await tx.insert(videoTagLinks).values({ videoId, tagId: tag.id }).onConflictDoNothing();
      await tx.update(videoTags).set({ videoCount: sql`${videoTags.videoCount} + 1` }).where(eq(videoTags.id, tag.id));
    }
  });
}

async function videoTagsOf(videoId: number) {
  return db
    .select({ id: videoTags.id, slug: videoTags.slug, name: videoTags.name })
    .from(videoTagLinks)
    .innerJoin(videoTags, eq(videoTags.id, videoTagLinks.tagId))
    .where(eq(videoTagLinks.videoId, videoId))
    .orderBy(asc(videoTags.name));
}

export async function listVideos(opts: {
  sort: VideoSort;
  limit: number;
  offset?: number;
  categoryId?: number;
  tagId?: number;
  q?: string;
  excludeIds?: number[];
}) {
  const conds: SQL[] = [];
  if (opts.categoryId) conds.push(eq(videos.categoryId, opts.categoryId));
  if (opts.tagId) {
    conds.push(inArray(videos.id, db.select({ id: videoTagLinks.videoId }).from(videoTagLinks).where(eq(videoTagLinks.tagId, opts.tagId))));
  }
  if (opts.q) conds.push(ilike(videos.title, likePattern(opts.q)));
  if (opts.excludeIds?.length) conds.push(notInArray(videos.id, opts.excludeIds));
  const where = conds.length ? and(...conds) : undefined;
  const offset = opts.offset ?? 0;

  if (opts.sort === "today" || opts.sort === "hot") {
    const recent = db
      .select({ videoId: videoViewDays.videoId, n: sql<number>`sum(${videoViewDays.views})::int`.as("n") })
      .from(videoViewDays)
      .where(gte(videoViewDays.day, opts.sort === "today" ? vnDay() : vnDay(6)))
      .groupBy(videoViewDays.videoId)
      .as("recent");
    // Videos with views in the period come first; the rest follow by all-time views.
    const rows = await db
      .select({ ...cardColumns, recentViews: sql<number>`coalesce(${recent.n}, 0)::int` })
      .from(videos)
      .leftJoin(videoCategories, eq(videoCategories.id, videos.categoryId))
      .leftJoin(recent, eq(recent.videoId, videos.id))
      .where(where)
      .orderBy(desc(sql`coalesce(${recent.n}, 0)`), desc(videos.viewCount), desc(videos.id))
      .limit(opts.limit)
      .offset(offset);
    return { rows: rows.map(mapCard), where };
  }

  if (opts.sort === "week") {
    const since = new Date(Date.now() - 7 * 86400_000);
    const week = db
      .select({
        videoId: videoVotes.videoId,
        l: sql<number>`count(*) filter (where ${videoVotes.value} = 1)::int`.as("l"),
        d: sql<number>`count(*) filter (where ${videoVotes.value} = -1)::int`.as("d"),
      })
      .from(videoVotes)
      .where(gte(videoVotes.createdAt, since))
      .groupBy(videoVotes.videoId)
      .as("week");
    const rows = await db
      .select(cardColumns)
      .from(videos)
      .leftJoin(videoCategories, eq(videoCategories.id, videos.categoryId))
      .leftJoin(week, eq(week.videoId, videos.id))
      .where(where)
      .orderBy(
        desc(sql`coalesce((${week.l} + 1.0) / (${week.l} + ${week.d} + 2), 0)`),
        desc(sql`coalesce(${week.l}, 0)`),
        desc(sql`(${videos.likeCount} + 1.0) / (${videos.likeCount} + ${videos.dislikeCount} + 2)`),
        desc(videos.viewCount),
      )
      .limit(opts.limit)
      .offset(offset);
    return { rows: rows.map(mapCard), where };
  }

  let order: SQL[];
  if (opts.sort === "best") {
    order = [
      desc(sql`(${videos.likeCount} + 1.0) / (${videos.likeCount} + ${videos.dislikeCount} + 2)`),
      desc(videos.likeCount),
      desc(videos.viewCount),
      desc(videos.id),
    ];
  } else if (opts.sort === "random") {
    order = [sql`random()`];
  } else {
    order = [desc(videos.createdAt), desc(videos.id)];
  }
  const rows = await db
    .select(cardColumns)
    .from(videos)
    .leftJoin(videoCategories, eq(videoCategories.id, videos.categoryId))
    .where(where)
    .orderBy(...order)
    .limit(opts.limit)
    .offset(offset);
  return { rows: rows.map(mapCard), where };
}

export async function videosByIds(ids: number[]) {
  if (!ids.length) return [];
  const rows = await db
    .select(cardColumns)
    .from(videos)
    .leftJoin(videoCategories, eq(videoCategories.id, videos.categoryId))
    .where(inArray(videos.id, ids));
  const byId = new Map(rows.map((r) => [r.id, mapCard(r)]));
  return ids.map((id) => byId.get(id)).filter((v) => v !== undefined);
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

async function findTag(slug: string | undefined) {
  if (!slug) return null;
  const [tag] = await db.select().from(videoTags).where(eq(videoTags.slug, slug)).limit(1);
  if (!tag) throw notFound("Thẻ không tồn tại.");
  return tag;
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

/** videoId -> last time someone opened it; feeds the "Đang được xem" list. */
const lastWatched = new Map<number, number>();
const WATCHING_WINDOW = 30 * 60_000;

export function watchingNowIds(limit: number) {
  const cutoff = Date.now() - WATCHING_WINDOW;
  for (const [id, ts] of lastWatched) if (ts < cutoff) lastWatched.delete(id);
  return [...lastWatched.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
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

/** Runs after the upload response: faststart remux, and server-side meta/thumbnail when the browser could not provide them. */
async function postProcess(videoId: number, file: string, ext: string, needMeta: boolean, needThumb: boolean, log: (msg: string) => void) {
  try {
    if (await faststart(file, ext)) {
      const { size } = await stat(file);
      await db.update(videos).set({ sizeBytes: size }).where(eq(videos.id, videoId));
      log(`video ${videoId}: faststart done`);
    }
    if (!needMeta && !needThumb) return;
    const meta = await probeVideo(file);
    if (needMeta && meta) {
      await db.update(videos).set({ duration: meta.duration, width: meta.width, height: meta.height }).where(eq(videos.id, videoId));
    }
    if (needThumb) {
      const at = meta?.duration ? Math.min(meta.duration * 0.2, 30) : 1;
      const frame = await grabFrame(file, at);
      if (frame) {
        const stored = await storeImage("thumbs", frame);
        const [still] = await db
          .update(videos)
          .set({ thumbKey: stored.key })
          .where(and(eq(videos.id, videoId), isNull(videos.thumbKey)))
          .returning({ id: videos.id });
        if (!still) await removeImage("thumbs", stored.key);
      }
    }
  } catch (err) {
    log(`video ${videoId}: post-process failed: ${(err as Error).message}`);
  }
}

const optionalId = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.coerce.number().int().positive().optional());

const uploadFields = z.object({
  title: z.string().trim().min(2, "Tiêu đề cần ít nhất 2 ký tự.").max(200, "Tiêu đề tối đa 200 ký tự."),
  description: z.string().trim().max(5000, "Mô tả tối đa 5.000 ký tự.").default(""),
  categoryId: optionalId,
  tags: z.string().max(1000).default(""),
  visibility: z.enum(VISIBILITIES).default("public"),
  duration: z.coerce.number().min(0).max(172800).default(0),
  width: z.coerce.number().int().min(0).max(20000).default(0),
  height: z.coerce.number().int().min(0).max(20000).default(0),
});

const videoCategoryBody = z.object({
  slug: slugSchema,
  name: z.string().trim().min(2, "Tên thể loại cần ít nhất 2 ký tự.").max(60),
  sortOrder: z.number().int().default(0),
});

const voteBody = z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) });

export default async function videoRoutes(app: FastifyInstance) {
  membersOnlyKeys.clear();
  for (const v of await db.select({ fileKey: videos.fileKey }).from(videos).where(eq(videos.visibility, "members"))) {
    membersOnlyKeys.add(v.fileKey);
  }

  app.get("/api/videos/categories", async () => ({ categories: await listVideoCategories() }));

  app.get("/api/videos/tags", async (req) => {
    const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(300).default(100) }), req.query);
    const tags = await db
      .select({ id: videoTags.id, slug: videoTags.slug, name: videoTags.name, videoCount: videoTags.videoCount })
      .from(videoTags)
      .where(sql`${videoTags.videoCount} > 0`)
      .orderBy(desc(videoTags.videoCount), asc(videoTags.name))
      .limit(limit);
    return { tags };
  });

  app.get("/api/videos", async (req) => {
    const q = parse(
      pageQuery.extend({
        sort: z.enum(VIDEO_SORTS).default("new"),
        category: z.string().max(64).optional(),
        tag: z.string().max(64).optional(),
        q: z.string().trim().max(100).optional(),
      }),
      req.query,
    );
    const [cat, tag] = await Promise.all([findCategory(q.category), findTag(q.tag)]);
    const { limit, offset } = paginate(q.page, PER_PAGE);
    const { rows, where } = await listVideos({
      sort: q.sort,
      limit,
      offset: q.sort === "random" ? 0 : offset,
      categoryId: cat?.id,
      tagId: tag?.id,
      q: q.q || undefined,
    });
    const [{ total }] = await db.select({ total: count() }).from(videos).where(where);
    return {
      videos: rows,
      category: cat,
      tag,
      page: q.page,
      totalPages: q.sort === "random" ? 1 : Math.max(1, Math.ceil(total / PER_PAGE)),
      total,
    };
  });

  app.get("/api/videos/random", async (req) => {
    const q = parse(
      z.object({ limit: z.coerce.number().int().min(1).max(24).default(8), exclude: z.coerce.number().int().positive().optional() }),
      req.query,
    );
    const { rows } = await listVideos({ sort: "random", limit: q.limit, excludeIds: q.exclude ? [q.exclude] : undefined });
    return { videos: rows };
  });

  app.get("/api/videos/watching", async () => ({ videos: await videosByIds(watchingNowIds(12)) }));

  app.get("/api/videos/by-ids", async (req) => {
    const { ids } = parse(z.object({ ids: z.string().max(1000).default("") }), req.query);
    const list = [...new Set(ids.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 100);
    return { videos: await videosByIds(list) };
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

  app.get("/api/videos/saved", async (req) => {
    const user = requireUser(req);
    const q = parse(pageQuery.extend({ list: z.enum(SAVE_LISTS).default("favorite") }), req.query);
    const { limit, offset } = paginate(q.page, PER_PAGE);
    const own = and(eq(videoSaves.userId, user.id), eq(videoSaves.list, q.list));
    const [[{ total }], rows] = await Promise.all([
      db.select({ total: count() }).from(videoSaves).where(own),
      db
        .select(cardColumns)
        .from(videoSaves)
        .innerJoin(videos, eq(videos.id, videoSaves.videoId))
        .leftJoin(videoCategories, eq(videoCategories.id, videos.categoryId))
        .where(own)
        .orderBy(desc(videoSaves.createdAt))
        .limit(limit)
        .offset(offset),
    ]);
    return { videos: rows.map(mapCard), page: q.page, totalPages: Math.max(1, Math.ceil(total / PER_PAGE)), total };
  });

  app.post(
    "/api/videos/:id/save",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
      const user = requireActive(req);
      const { id } = parse(idParam, req.params);
      const { list } = parse(z.object({ list: z.enum(SAVE_LISTS) }), req.body);
      await getVideo(id);
      const inserted = await db
        .insert(videoSaves)
        .values({ userId: user.id, videoId: id, list })
        .onConflictDoNothing()
        .returning({ id: videoSaves.videoId });
      if (!inserted.length) {
        await db.delete(videoSaves).where(and(eq(videoSaves.userId, user.id), eq(videoSaves.videoId, id), eq(videoSaves.list, list)));
      }
      return { list, saved: inserted.length > 0 };
    },
  );

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
    const locked = row.visibility === "members" && !req.user;

    if (!locked) {
      lastWatched.set(id, Date.now());
      if (countView(req.ip, id)) {
        await db.update(videos).set({ viewCount: sql`${videos.viewCount} + 1` }).where(eq(videos.id, id));
        await db
          .insert(videoViewDays)
          .values({ videoId: id, day: vnDay(), views: 1 })
          .onConflictDoUpdate({ target: [videoViewDays.videoId, videoViewDays.day], set: { views: sql`${videoViewDays.views} + 1` } });
        row.viewCount += 1;
      }
    }

    let myVote = 0;
    const saved = { favorite: false, later: false };
    if (req.user) {
      await db
        .insert(videoHistory)
        .values({ userId: req.user.id, videoId: id })
        .onConflictDoUpdate({ target: [videoHistory.userId, videoHistory.videoId], set: { viewedAt: new Date() } });
      const [[vote], lists] = await Promise.all([
        db
          .select({ value: videoVotes.value })
          .from(videoVotes)
          .where(and(eq(videoVotes.videoId, id), eq(videoVotes.userId, req.user.id)))
          .limit(1),
        db
          .select({ list: videoSaves.list })
          .from(videoSaves)
          .where(and(eq(videoSaves.videoId, id), eq(videoSaves.userId, req.user.id))),
      ]);
      myVote = vote?.value ?? 0;
      for (const l of lists) if (l.list === "favorite" || l.list === "later") saved[l.list] = true;
    }

    const { fileKey, ext, categoryId, author: authorRow, description, ...card } = row;
    // Half from the same category, the rest random so older videos keep resurfacing.
    const sameCat = categoryId ? (await listVideos({ sort: "today", limit: 6, categoryId, excludeIds: [id] })).rows : [];
    const random = await listVideos({ sort: "random", limit: 12 - sameCat.length, excludeIds: [id, ...sameCat.map((v) => v.id)] });
    return {
      video: {
        ...mapCard(card),
        description: locked ? "" : description,
        videoUrl: locked ? null : videoFileUrl(fileKey, ext),
        locked,
        author: author(authorRow),
        tags: await videoTagsOf(id),
      },
      myVote,
      saved,
      related: [...sameCat, ...random.rows],
    };
  });

  app.post(
    "/api/videos/:id/vote",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
      const user = requireActive(req);
      const { id } = parse(idParam, req.params);
      const { value } = parse(voteBody, req.body);
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
            .onConflictDoUpdate({ target: [videoVotes.videoId, videoVotes.userId], set: { value, createdAt: new Date() } });
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

  const commentColumns = {
    id: videoComments.id,
    parentId: videoComments.parentId,
    content: videoComments.content,
    likeCount: videoComments.likeCount,
    dislikeCount: videoComments.dislikeCount,
    createdAt: videoComments.createdAt,
    author: authorColumns,
  };

  app.get("/api/videos/:id/comments", async (req) => {
    const { id } = parse(idParam, req.params);
    const { page } = parse(pageQuery, req.query);
    const video = await getVideo(id);
    const { limit, offset } = paginate(page, COMMENTS_PER_PAGE);
    const topLevel = and(eq(videoComments.videoId, id), isNull(videoComments.parentId));
    const [[{ total }], parents] = await Promise.all([
      db.select({ total: count() }).from(videoComments).where(topLevel),
      db
        .select(commentColumns)
        .from(videoComments)
        .innerJoin(users, eq(users.id, videoComments.userId))
        .where(topLevel)
        .orderBy(desc(videoComments.id))
        .limit(limit)
        .offset(offset),
    ]);
    const replies = parents.length
      ? await db
          .select(commentColumns)
          .from(videoComments)
          .innerJoin(users, eq(users.id, videoComments.userId))
          .where(
            inArray(
              videoComments.parentId,
              parents.map((p) => p.id),
            ),
          )
          .orderBy(asc(videoComments.id))
          .limit(1000)
      : [];
    const myVotes = new Map<number, number>();
    if (req.user) {
      const ids = [...parents, ...replies].map((c) => c.id);
      if (ids.length) {
        const rows = await db
          .select({ commentId: videoCommentVotes.commentId, value: videoCommentVotes.value })
          .from(videoCommentVotes)
          .where(and(eq(videoCommentVotes.userId, req.user.id), inArray(videoCommentVotes.commentId, ids)));
        for (const r of rows) myVotes.set(r.commentId, r.value);
      }
    }
    const mapComment = (c: (typeof parents)[number]) => ({ ...c, author: author(c.author), myVote: myVotes.get(c.id) ?? 0 });
    return {
      comments: parents.map((p) => ({ ...mapComment(p), replies: replies.filter((r) => r.parentId === p.id).map(mapComment) })),
      page,
      totalPages: Math.max(1, Math.ceil(total / COMMENTS_PER_PAGE)),
      total: video.commentCount,
    };
  });

  app.post(
    "/api/videos/:id/comments",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const user = requireActive(req);
      const { id } = parse(idParam, req.params);
      const { content, parentId } = parse(
        z.object({
          content: z.string().trim().min(1, "Bình luận không được để trống.").max(2000, "Bình luận tối đa 2.000 ký tự."),
          parentId: z.number().int().positive().optional(),
        }),
        req.body,
      );
      await getVideo(id);
      let parent: { id: number; userId: number } | null = null;
      if (parentId) {
        const [p] = await db
          .select({ id: videoComments.id, userId: videoComments.userId, videoId: videoComments.videoId, parentId: videoComments.parentId })
          .from(videoComments)
          .where(eq(videoComments.id, parentId))
          .limit(1);
        if (!p || p.videoId !== id) throw notFound("Bình luận gốc không tồn tại.");
        parent = p.parentId ? { id: p.parentId, userId: p.userId } : p;
      }
      const [comment] = await db
        .insert(videoComments)
        .values({ videoId: id, userId: user.id, content, parentId: parent?.id ?? null })
        .returning();
      await db.update(videos).set({ commentCount: sql`${videos.commentCount} + 1` }).where(eq(videos.id, id));
      if (parent) await notify([{ userId: parent.userId, type: "comment_reply", actorId: user.id, videoId: id, commentId: comment.id }]);
      return {
        comment: {
          id: comment.id,
          parentId: comment.parentId,
          content: comment.content,
          likeCount: 0,
          dislikeCount: 0,
          myVote: 0,
          createdAt: comment.createdAt,
          author: author(user),
          replies: [],
        },
      };
    },
  );

  app.post(
    "/api/videos/comments/:id/vote",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
      const user = requireActive(req);
      const { id } = parse(idParam, req.params);
      const { value } = parse(voteBody, req.body);
      const [comment] = await db.select({ userId: videoComments.userId }).from(videoComments).where(eq(videoComments.id, id)).limit(1);
      if (!comment) throw notFound("Bình luận không tồn tại.");
      if (comment.userId === user.id) throw badRequest("Không thể tự đánh giá bình luận của mình.");
      return db.transaction(async (tx) => {
        const [prev] = await tx
          .select({ value: videoCommentVotes.value })
          .from(videoCommentVotes)
          .where(and(eq(videoCommentVotes.commentId, id), eq(videoCommentVotes.userId, user.id)))
          .limit(1);
        const before = prev?.value ?? 0;
        if (value === 0) {
          await tx.delete(videoCommentVotes).where(and(eq(videoCommentVotes.commentId, id), eq(videoCommentVotes.userId, user.id)));
        } else {
          await tx
            .insert(videoCommentVotes)
            .values({ commentId: id, userId: user.id, value })
            .onConflictDoUpdate({ target: [videoCommentVotes.commentId, videoCommentVotes.userId], set: { value } });
        }
        const likeDelta = (value === 1 ? 1 : 0) - (before === 1 ? 1 : 0);
        const dislikeDelta = (value === -1 ? 1 : 0) - (before === -1 ? 1 : 0);
        const [c] = await tx
          .update(videoComments)
          .set({
            likeCount: sql`greatest(${videoComments.likeCount} + ${likeDelta}, 0)`,
            dislikeCount: sql`greatest(${videoComments.dislikeCount} + ${dislikeDelta}, 0)`,
          })
          .where(eq(videoComments.id, id))
          .returning({ likeCount: videoComments.likeCount, dislikeCount: videoComments.dislikeCount });
        return { ...c, myVote: value };
      });
    },
  );

  app.delete("/api/videos/comments/:id", async (req, reply) => {
    const user = requireActive(req);
    const { id } = parse(idParam, req.params);
    const [comment] = await db.select().from(videoComments).where(eq(videoComments.id, id)).limit(1);
    if (!comment) throw notFound("Bình luận không tồn tại.");
    if (comment.userId !== user.id && !isStaff(user)) throw forbidden();
    const [{ n: replyCount }] = await db.select({ n: count() }).from(videoComments).where(eq(videoComments.parentId, id));
    await db.delete(videoComments).where(eq(videoComments.id, id));
    await db
      .update(videos)
      .set({ commentCount: sql`greatest(${videos.commentCount} - ${1 + replyCount}, 0)` })
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

  app.get("/api/admin/videos/:id", async (req) => {
    requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const video = await getVideo(id);
    const tags = await videoTagsOf(id);
    return {
      video: {
        id: video.id,
        title: video.title,
        description: video.description,
        categoryId: video.categoryId,
        visibility: video.visibility,
        tags: tags.map((t) => t.name).join(", "),
      },
    };
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
        const parts = req.parts({ limits: { fileSize: config.maxVideoMb * MB, files: 2, fields: 12, fieldSize: 20_000 } });
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
        if (body.visibility === "members") membersOnlyKeys.add(saved.key);
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
            visibility: body.visibility,
          })
          .returning({ id: videos.id });
        cleanup.length = 0;
        await bumpCategory(body.categoryId ?? null, 1);
        if (body.tags) await setVideoTags(video.id, body.tags);
        void postProcess(video.id, finalPath, saved.ext, !body.duration || !body.width, !thumbKey, (msg) => req.log.info(msg));
        return { video };
      } finally {
        for (const file of cleanup) await rm(file, { force: true });
      }
    },
  );

  app.patch("/api/admin/videos/:id", async (req) => {
    requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const { tags, ...body } = parse(
      z.object({
        title: uploadFields.shape.title.optional(),
        description: uploadFields.shape.description.optional(),
        categoryId: z.number().int().positive().nullable().optional(),
        visibility: z.enum(VISIBILITIES).optional(),
        tags: z.string().max(1000).optional(),
      }),
      req.body,
    );
    const video = await getVideo(id);
    if (body.categoryId !== undefined && body.categoryId !== video.categoryId) {
      await assertCategory(body.categoryId);
      await bumpCategory(video.categoryId, -1);
      await bumpCategory(body.categoryId, 1);
    }
    if (Object.keys(body).length) await db.update(videos).set(body).where(eq(videos.id, id));
    if (body.visibility === "members") membersOnlyKeys.add(video.fileKey);
    if (body.visibility === "public") membersOnlyKeys.delete(video.fileKey);
    if (tags !== undefined) await setVideoTags(id, tags);
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
    const tagIds = (await db.select({ id: videoTagLinks.tagId }).from(videoTagLinks).where(eq(videoTagLinks.videoId, id))).map((t) => t.id);
    await db.delete(videos).where(eq(videos.id, id));
    if (tagIds.length) {
      await db
        .update(videoTags)
        .set({ videoCount: sql`greatest(${videoTags.videoCount} - 1, 0)` })
        .where(inArray(videoTags.id, tagIds));
    }
    await bumpCategory(video.categoryId, -1);
    membersOnlyKeys.delete(video.fileKey);
    lastWatched.delete(id);
    await removeVideoFile(video.fileKey, video.ext);
    if (video.thumbKey) await removeImage("thumbs", video.thumbKey);
    return ok(reply);
  });
}
