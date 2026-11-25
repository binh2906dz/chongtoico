import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, notInArray, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { author, authorColumns, isStaff, requireActive, requireAdmin, requireUser, type User } from "../auth.js";
import { isImportRequest } from "../importSecret.js";
import { config } from "../config.js";
import { db } from "../db/index.js";
import {
  articleComments,
  articleCommentVotes,
  articleHistory,
  articleImages,
  articleSaves,
  articleViewDays,
  articleVideos,
  articles,
  articleVotes,
  users,
} from "../db/schema.js";
import { faststart, grabFrame, probeVideo } from "../ffmpeg.js";
import { badRequest, forbidden, HttpError, idParam, notFound, ok, pageQuery, paginate, parse } from "../http.js";
import {
  looksLikeVideo,
  removeImage,
  removeVideoFile,
  storeImage,
  VIDEO_DIR,
  videoExtFromName,
  videoFileUrl,
  type VideoExt,
} from "../media.js";
import { notify } from "../notify.js";

const PER_PAGE = 24;
const COMMENTS_PER_PAGE = 20;
const MB = 1024 * 1024;

export const ARTICLE_SORTS = ["today", "new", "best", "hot", "week", "random"] as const;
export type ArticleSort = (typeof ARTICLE_SORTS)[number];
export const SAVE_LISTS = ["favorite", "later"] as const;
export const VISIBILITIES = ["public", "members"] as const;

// View days are counted in Vietnam time (UTC+7).
const vnDay = (daysAgo = 0) => new Date(Date.now() + 7 * 3600_000 - daysAgo * 86400_000).toISOString().slice(0, 10);

/** File keys of members-only articles; checked before /media/v/ serves a file. */
export const membersOnlyKeys = new Set<string>();

export const articleImageUrl = (key: string | null, thumb = false) => (key ? `/media/a/${key}${thumb ? "_t" : ""}.webp` : null);
export const articleThumbUrl = (key: string | null) => (key ? `/media/t/${key}.webp` : null);

const cardColumns = {
  id: articles.id,
  title: articles.title,
  coverType: articles.coverType,
  coverImageKey: articles.coverImageKey,
  coverDuration: articles.coverDuration,
  imageCount: articles.imageCount,
  videoCount: articles.videoCount,
  viewCount: articles.viewCount,
  likeCount: articles.likeCount,
  dislikeCount: articles.dislikeCount,
  commentCount: articles.commentCount,
  visibility: articles.visibility,
  isHot: articles.isHot,
  createdAt: articles.createdAt,
};

type CardRow = {
  id: number;
  coverType: string;
  coverImageKey: string | null;
  likeCount: number;
  dislikeCount: number;
  visibility: string;
  isHot?: boolean;
} & Record<string, unknown>;

/** Most viewed articles of the last 7 days (at least HOT_MIN_VIEWS), shown with a HOT badge; refreshed every 5 minutes. */
const HOT_COUNT = 12;
const HOT_MIN_VIEWS = 10;
let hotIds = new Set<number>();
let hotLoadedAt = 0;

async function refreshHotIds() {
  if (Date.now() - hotLoadedAt < 5 * 60_000) return;
  hotLoadedAt = Date.now();
  try {
    const total = sql<number>`sum(${articleViewDays.views})`;
    const rows = await db
      .select({ articleId: articleViewDays.articleId })
      .from(articleViewDays)
      .where(gte(articleViewDays.day, vnDay(6)))
      .groupBy(articleViewDays.articleId)
      .having(sql`${total} >= ${HOT_MIN_VIEWS}`)
      .orderBy(desc(total))
      .limit(HOT_COUNT);
    hotIds = new Set(rows.map((r) => r.articleId));
  } catch {
    // keep the previous set; retried after the next interval
  }
}

/**
 * Ảnh bìa của bài viết. Nguồn phụ thuộc `coverType`:
 * - "image": ảnh trong bộ sưu tập bài viết (thư mục albums) -> /media/a/
 * - "video": khung hình lấy từ video (thư mục thumbs) -> /media/t/
 * Trước đây cả hai đều trỏ về /media/a/ nên bìa video luôn 404.
 */
export const articleCoverUrl = (coverType: string, key: string | null) => {
  if (!key) return null;
  if (coverType === "video") return `/media/t/${key}.webp`;
  if (coverType === "image") return `/media/a/${key}_t.webp`;
  return null;
};

function mapCard<T extends CardRow>(row: T) {
  const { coverImageKey, coverType, visibility, ...rest } = row;
  const votes = row.likeCount + row.dislikeCount;
  return {
    ...rest,
    coverType,
    coverUrl: articleCoverUrl(coverType, coverImageKey),
    hasVideo: coverType === "video",
    membersOnly: visibility === "members",
    // Bài được admin đánh dấu HOT luôn nổi bật, kể cả khi chưa đủ lượt xem.
    hot: row.isHot === true || hotIds.has(row.id),
    rating: votes ? Math.round((row.likeCount * 100) / votes) : null,
  };
}

/**
 * Bài "chỉ thành viên" không được lộ link ảnh bìa cho khách: ảnh sẽ trả 403 và giao diện
 * hiện ảnh vỡ. Vì vậy danh sách công khai trả coverUrl = null cho bài này.
 */
function hideLockedCover<T extends { coverUrl: string | null; membersOnly: boolean }>(card: T, viewer: User | null): T {
  if (card.membersOnly && !viewer) return { ...card, coverUrl: null };
  return card;
}

function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

export async function listArticles(opts: {
  sort: ArticleSort;
  limit: number;
  offset?: number;
  q?: string;
  excludeIds?: number[];
  /** Người đang xem; null = khách. Bài "chỉ thành viên" không lộ ảnh bìa cho khách. */
  viewer?: User | null;
}) {
  await refreshHotIds();
  const conds: SQL[] = [];
  if (opts.q) conds.push(ilike(articles.title, likePattern(opts.q)));
  if (opts.excludeIds?.length) conds.push(notInArray(articles.id, opts.excludeIds));
  const where = conds.length ? and(...conds) : undefined;
  const offset = opts.offset ?? 0;

  if (opts.sort === "today" || opts.sort === "hot") {
    const recent = db
      .select({ articleId: articleViewDays.articleId, n: sql<number>`sum(${articleViewDays.views})::int`.as("n") })
      .from(articleViewDays)
      .where(gte(articleViewDays.day, opts.sort === "today" ? vnDay() : vnDay(6)))
      .groupBy(articleViewDays.articleId)
      .as("recent");
    // Articles with views in the period come first; the rest follow by all-time views.
    // Bài do admin gắn HOT luôn đứng đầu nhóm.
    const rows = await db
      .select({ ...cardColumns, recentViews: sql<number>`coalesce(${recent.n}, 0)::int` })
      .from(articles)
      .leftJoin(recent, eq(recent.articleId, articles.id))
      .where(where)
      .orderBy(desc(articles.isHot), desc(sql`coalesce(${recent.n}, 0)`), desc(articles.viewCount), desc(articles.id))
      .limit(opts.limit)
      .offset(offset);
    return { rows: rows.map((r) => hideLockedCover(mapCard(r), opts.viewer ?? null)), where };
  }

  if (opts.sort === "week") {
    const since = new Date(Date.now() - 7 * 86400_000);
    const week = db
      .select({
        articleId: articleVotes.articleId,
        l: sql<number>`count(*) filter (where ${articleVotes.value} = 1)::int`.as("l"),
        d: sql<number>`count(*) filter (where ${articleVotes.value} = -1)::int`.as("d"),
      })
      .from(articleVotes)
      .where(gte(articleVotes.createdAt, since))
      .groupBy(articleVotes.articleId)
      .as("week");
    const rows = await db
      .select(cardColumns)
      .from(articles)
      .leftJoin(week, eq(week.articleId, articles.id))
      .where(where)
      .orderBy(
        desc(sql`coalesce((${week.l} + 1.0) / (${week.l} + ${week.d} + 2), 0)`),
        desc(sql`coalesce(${week.l}, 0)`),
        desc(sql`(${articles.likeCount} + 1.0) / (${articles.likeCount} + ${articles.dislikeCount} + 2)`),
        desc(articles.viewCount),
      )
      .limit(opts.limit)
      .offset(offset);
    return { rows: rows.map((r) => hideLockedCover(mapCard(r), opts.viewer ?? null)), where };
  }

  let order: SQL[];
  if (opts.sort === "best") {
    order = [
      desc(sql`(${articles.likeCount} + 1.0) / (${articles.likeCount} + ${articles.dislikeCount} + 2)`),
      desc(articles.likeCount),
      desc(articles.viewCount),
      desc(articles.id),
    ];
  } else if (opts.sort === "random") {
    order = [sql`random()`];
  } else {
    order = [desc(articles.createdAt), desc(articles.id)];
  }
  const rows = await db
    .select(cardColumns)
    .from(articles)
    .where(where)
    .orderBy(...order)
    .limit(opts.limit)
    .offset(offset);
  return { rows: rows.map((r) => hideLockedCover(mapCard(r), opts.viewer ?? null)), where };
}

export async function articlesByIds(ids: number[], viewer: User | null = null) {
  if (!ids.length) return [];
  await refreshHotIds();
  const rows = await db
    .select(cardColumns)
    .from(articles)
    .where(inArray(articles.id, ids));
  const byId = new Map(rows.map((r) => [r.id, hideLockedCover(mapCard(r), viewer)]));
  return ids.map((id) => byId.get(id)).filter((v) => v !== undefined);
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

/** articleId -> last time someone opened it; feeds the "Đang được xem" list. */
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

async function getArticle(id: number) {
  const [article] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  if (!article) throw notFound("Bài viết không tồn tại hoặc đã bị xoá.");
  return article;
}

/**
 * Runs after the upload response: faststart remux, and server-side meta/thumbnail when the browser could not provide them.
 * `articleId` is used to set the article cover when this video is the first media and the browser sent no thumbnail.
 */
async function postProcess(
  videoId: number,
  articleId: number,
  file: string,
  ext: string,
  needMeta: boolean,
  needThumb: boolean,
  log: (msg: string) => void,
) {
  try {
    if (await faststart(file, ext)) {
      const { size } = await stat(file);
      await db.update(articleVideos).set({ sizeBytes: size }).where(eq(articleVideos.id, videoId));
      log(`article video ${videoId}: faststart done`);
    }
    if (!needMeta && !needThumb) return;
    const meta = await probeVideo(file);
    if (needMeta && meta) {
      await db.update(articleVideos).set({ duration: meta.duration, width: meta.width, height: meta.height }).where(eq(articleVideos.id, videoId));
    }
    if (needThumb) {
      const at = meta?.duration ? Math.min(meta.duration * 0.2, 30) : 1;
      const frame = await grabFrame(file, at);
      if (frame) {
        const stored = await storeImage("thumbs", frame);
        const [still] = await db
          .update(articleVideos)
          .set({ thumbKey: stored.key })
          .where(and(eq(articleVideos.id, videoId), isNull(articleVideos.thumbKey)))
          .returning({ id: articleVideos.id });
        if (!still) {
          await removeImage("thumbs", stored.key);
        } else {
          // Bài chưa có ảnh bìa: dùng luôn khung hình vừa tạo làm bìa,
          // nếu không thì bài sẽ mất ảnh bìa vĩnh viễn (trước đây coverImageKey = null).
          const [art] = await db
            .select({ coverType: articles.coverType, coverImageKey: articles.coverImageKey })
            .from(articles)
            .where(eq(articles.id, articleId))
            .limit(1);
          if (art && (art.coverType === "none" || !art.coverImageKey)) {
            await setCover(articleId, "video", stored.key, meta?.duration ? Math.round(meta.duration) : 0);
          }
        }
      }
    }
  } catch (err) {
    log(`article video ${videoId}: post-process failed: ${(err as Error).message}`);
  }
}

/** Link nút bấm: chỉ nhận http/https, rỗng = không hiện nút. */
const linkField = z
  .string()
  .trim()
  .max(1000)
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || /^https?:\/\/[^\s]+$/i.test(v), "Link phải bắt đầu bằng http:// hoặc https://")
  .nullable()
  .optional();

const articleBody = z.object({
  title: z.string().trim().min(2, "Tiêu đề cần ít nhất 2 ký tự.").max(200, "Tiêu đề tối đa 200 ký tự."),
  description: z.string().trim().max(20000, "Nội dung tối đa 20.000 ký tự.").default(""),
  watchLink: linkField,
  vipLink: linkField,
  visibility: z.enum(VISIBILITIES).default("public"),
  isHot: z.boolean().default(false),
});

const voteBody = z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) });

/** Media attached to an article: images (kind "a") and videos (kind "v"). */
const mediaFileSchema = z.object({
  id: z.number().int().positive(),
  type: z.enum(["image", "video"]),
  url: z.string(),
  thumbUrl: z.string().nullable(),
  width: z.number().int(),
  height: z.number().int(),
  duration: z.number().int().default(0),
  sizeBytes: z.number().int().default(0),
});

export default async function articleRoutes(app: FastifyInstance) {
  membersOnlyKeys.clear();
  for (const v of await db
    .select({ fileKey: articleVideos.fileKey })
    .from(articleVideos)
    .innerJoin(articles, eq(articles.id, articleVideos.articleId))
    .where(eq(articles.visibility, "members"))) {
    membersOnlyKeys.add(v.fileKey);
  }

  app.get("/api/articles", async (req) => {
    const q = parse(
      pageQuery.extend({
        sort: z.enum(ARTICLE_SORTS).default("new"),
        q: z.string().trim().max(100).optional(),
      }),
      req.query,
    );
    const { limit, offset } = paginate(q.page, PER_PAGE);
    const { rows, where } = await listArticles({
      sort: q.sort,
      limit,
      offset: q.sort === "random" ? 0 : offset,
      q: q.q || undefined,
      viewer: req.user,
    });
    const [{ total }] = await db.select({ total: count() }).from(articles).where(where);
    return {
      articles: rows,
      page: q.page,
      totalPages: q.sort === "random" ? 1 : Math.max(1, Math.ceil(total / PER_PAGE)),
      total,
    };
  });

  app.get("/api/articles/random", async (req) => {
    const q = parse(
      z.object({ limit: z.coerce.number().int().min(1).max(24).default(8), exclude: z.coerce.number().int().positive().optional() }),
      req.query,
    );
    const { rows } = await listArticles({ sort: "random", limit: q.limit, excludeIds: q.exclude ? [q.exclude] : undefined, viewer: req.user });
    return { articles: rows };
  });

  app.get("/api/articles/watching", async (req) => ({ articles: await articlesByIds(watchingNowIds(12), req.user) }));

  app.get("/api/articles/by-ids", async (req) => {
    const { ids } = parse(z.object({ ids: z.string().max(1000).default("") }), req.query);
    const list = [...new Set(ids.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 100);
    return { articles: await articlesByIds(list, req.user) };
  });

  app.get("/api/articles/history", async (req) => {
    const user = requireUser(req);
    const { page } = parse(pageQuery, req.query);
    const { limit, offset } = paginate(page, PER_PAGE);
    const [[{ total }], rows] = await Promise.all([
      db.select({ total: count() }).from(articleHistory).where(eq(articleHistory.userId, user.id)),
      db
        .select({ ...cardColumns, viewedAt: articleHistory.viewedAt })
        .from(articleHistory)
        .innerJoin(articles, eq(articles.id, articleHistory.articleId))
        .where(eq(articleHistory.userId, user.id))
        .orderBy(desc(articleHistory.viewedAt))
        .limit(limit)
        .offset(offset),
    ]);
    return { articles: rows.map(mapCard), page, totalPages: Math.max(1, Math.ceil(total / PER_PAGE)) };
  });

  app.delete("/api/articles/history", async (req, reply) => {    const user = requireUser(req);
    await db.delete(articleHistory).where(eq(articleHistory.userId, user.id));
    return ok(reply);
  });

  app.delete("/api/articles/history/:id", async (req, reply) => {
    const user = requireUser(req);
    const { id } = parse(idParam, req.params);
    await db.delete(articleHistory).where(and(eq(articleHistory.userId, user.id), eq(articleHistory.articleId, id)));
    return ok(reply);
  });

  app.get("/api/articles/saved", async (req) => {
    const user = requireUser(req);
    const q = parse(pageQuery.extend({ list: z.enum(SAVE_LISTS).default("favorite") }), req.query);
    const { limit, offset } = paginate(q.page, PER_PAGE);
    const own = and(eq(articleSaves.userId, user.id), eq(articleSaves.list, q.list));
    const [[{ total }], rows] = await Promise.all([
      db.select({ total: count() }).from(articleSaves).where(own),
      db
        .select(cardColumns)
        .from(articleSaves)
        .innerJoin(articles, eq(articles.id, articleSaves.articleId))
        .where(own)
        .orderBy(desc(articleSaves.createdAt))
        .limit(limit)
        .offset(offset),
    ]);
    return { articles: rows.map(mapCard), page: q.page, totalPages: Math.max(1, Math.ceil(total / PER_PAGE)), total };
  });

  app.post(
    "/api/articles/:id/save",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
      const user = requireActive(req);
      const { id } = parse(idParam, req.params);
      const { list } = parse(z.object({ list: z.enum(SAVE_LISTS) }), req.body);
      await getArticle(id);
      const inserted = await db
        .insert(articleSaves)
        .values({ userId: user.id, articleId: id, list })
        .onConflictDoNothing()
        .returning({ id: articleSaves.articleId });
      if (!inserted.length) {
        await db.delete(articleSaves).where(and(eq(articleSaves.userId, user.id), eq(articleSaves.articleId, id), eq(articleSaves.list, list)));
      }
      return { list, saved: inserted.length > 0 };
    },
  );

  app.get("/api/articles/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const [row] = await db
      .select({
        ...cardColumns,
        description: articles.description,
        watchLink: articles.watchLink,
        vipLink: articles.vipLink,
        author: authorColumns,
      })
      .from(articles)
      .innerJoin(users, eq(users.id, articles.userId))
      .where(eq(articles.id, id))
      .limit(1);
    if (!row) throw notFound("Bài viết không tồn tại hoặc đã bị xoá.");
    const locked = row.visibility === "members" && !req.user;

    if (!locked) {
      lastWatched.set(id, Date.now());
      if (countView(req.ip, id)) {
        await db.update(articles).set({ viewCount: sql`${articles.viewCount} + 1` }).where(eq(articles.id, id));
        await db
          .insert(articleViewDays)
          .values({ articleId: id, day: vnDay(), views: 1 })
          .onConflictDoUpdate({ target: [articleViewDays.articleId, articleViewDays.day], set: { views: sql`${articleViewDays.views} + 1` } });
        row.viewCount += 1;
      }
    }

    let myVote = 0;
    const saved = { favorite: false, later: false };
    if (req.user) {
      await db
        .insert(articleHistory)
        .values({ userId: req.user.id, articleId: id })
        .onConflictDoUpdate({ target: [articleHistory.userId, articleHistory.articleId], set: { viewedAt: new Date() } });
      const [[vote], lists] = await Promise.all([
        db
          .select({ value: articleVotes.value })
          .from(articleVotes)
          .where(and(eq(articleVotes.articleId, id), eq(articleVotes.userId, req.user.id)))
          .limit(1),
        db
          .select({ list: articleSaves.list })
          .from(articleSaves)
          .where(and(eq(articleSaves.articleId, id), eq(articleSaves.userId, req.user.id))),
      ]);
      myVote = vote?.value ?? 0;
      for (const l of lists) if (l.list === "favorite" || l.list === "later") saved[l.list] = true;
    }

    const { author: authorRow, description, watchLink, vipLink, ...rest } = row;

    // Locked articles hide their media entirely.
    let images: (typeof mediaFileSchema)["_output"][] = [];
    let videos: (typeof mediaFileSchema)["_output"][] = [];
    if (!locked) {
      const [imgRows, vidRows] = await Promise.all([
        db.select().from(articleImages).where(eq(articleImages.articleId, id)).orderBy(asc(articleImages.sortOrder), asc(articleImages.id)),
        db.select().from(articleVideos).where(eq(articleVideos.articleId, id)).orderBy(asc(articleVideos.sortOrder), asc(articleVideos.id)),
      ]);
      images = imgRows.map((img) => ({
        id: img.id,
        type: "image" as const,
        url: articleImageUrl(img.fileKey)!,
        thumbUrl: articleImageUrl(img.fileKey, true),
        width: img.width,
        height: img.height,
        duration: 0,
        sizeBytes: 0,
      }));
      videos = vidRows.map((v) => ({
        id: v.id,
        type: "video" as const,
        url: videoFileUrl(v.fileKey, v.ext),
        thumbUrl: articleThumbUrl(v.thumbKey),
        width: v.width,
        height: v.height,
        duration: v.duration,
        sizeBytes: v.sizeBytes,
      }));
    }

    // Gợi ý bài liên quan: ngẫu nhiên (bài cũ vẫn có cơ hội xuất hiện).
    const random = await listArticles({ sort: "random", limit: 12, excludeIds: [id], viewer: req.user });
    const card = mapCard(rest);
    return {
      article: {
        ...card,
        // Bài "chỉ thành viên" không lộ link ảnh bìa cho khách (ảnh sẽ trả 403 -> vỡ ảnh).
        coverUrl: locked ? null : card.coverUrl,
        description: locked ? "" : description,
        // Nút "Xem ngay" / "Kênh VIP" — bài "chỉ thành viên" không lộ link cho khách.
        watchLink: locked ? null : watchLink,
        vipLink: locked ? null : vipLink,
        locked,
        author: author(authorRow),
        images,
        videos,
      },
      myVote,
      saved,
      related: random.rows,
    };
  });

  app.post(
    "/api/articles/:id/vote",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
      const user = requireActive(req);
      const { id } = parse(idParam, req.params);
      const { value } = parse(voteBody, req.body);
      await getArticle(id);
      return db.transaction(async (tx) => {
        const [prev] = await tx
          .select({ value: articleVotes.value })
          .from(articleVotes)
          .where(and(eq(articleVotes.articleId, id), eq(articleVotes.userId, user.id)))
          .limit(1);
        const before = prev?.value ?? 0;
        if (value === 0) {
          await tx.delete(articleVotes).where(and(eq(articleVotes.articleId, id), eq(articleVotes.userId, user.id)));
        } else {
          await tx
            .insert(articleVotes)
            .values({ articleId: id, userId: user.id, value })
            .onConflictDoUpdate({ target: [articleVotes.articleId, articleVotes.userId], set: { value, createdAt: new Date() } });
        }
        const likeDelta = (value === 1 ? 1 : 0) - (before === 1 ? 1 : 0);
        const dislikeDelta = (value === -1 ? 1 : 0) - (before === -1 ? 1 : 0);
        const [v] = await tx
          .update(articles)
          .set({
            likeCount: sql`greatest(${articles.likeCount} + ${likeDelta}, 0)`,
            dislikeCount: sql`greatest(${articles.dislikeCount} + ${dislikeDelta}, 0)`,
          })
          .where(eq(articles.id, id))
          .returning({ likeCount: articles.likeCount, dislikeCount: articles.dislikeCount });
        const votes = v.likeCount + v.dislikeCount;
        return { ...v, myVote: value, rating: votes ? Math.round((v.likeCount * 100) / votes) : null };
      });
    },
  );

  const commentColumns = {
    id: articleComments.id,
    parentId: articleComments.parentId,
    content: articleComments.content,
    likeCount: articleComments.likeCount,
    dislikeCount: articleComments.dislikeCount,
    createdAt: articleComments.createdAt,
    author: authorColumns,
  };

  app.get("/api/articles/:id/comments", async (req) => {
    const { id } = parse(idParam, req.params);
    const { page } = parse(pageQuery, req.query);
    const article = await getArticle(id);
    // Bài "chỉ thành viên": khách không được đọc bình luận, nếu không nội dung bị lộ công khai.
    if (article.visibility === "members" && !req.user) throw forbidden("Bài viết chỉ dành cho thành viên.");
    const { limit, offset } = paginate(page, COMMENTS_PER_PAGE);
    const topLevel = and(eq(articleComments.articleId, id), isNull(articleComments.parentId));
    const [[{ total }], parents] = await Promise.all([
      db.select({ total: count() }).from(articleComments).where(topLevel),
      db
        .select(commentColumns)
        .from(articleComments)
        .innerJoin(users, eq(users.id, articleComments.userId))
        .where(topLevel)
        .orderBy(desc(articleComments.id))
        .limit(limit)
        .offset(offset),
    ]);
    const replies = parents.length
      ? await db
          .select(commentColumns)
          .from(articleComments)
          .innerJoin(users, eq(users.id, articleComments.userId))
          .where(
            inArray(
              articleComments.parentId,
              parents.map((p) => p.id),
            ),
          )
          .orderBy(asc(articleComments.id))
          .limit(1000)
      : [];
    const myVotes = new Map<number, number>();
    if (req.user) {
      const ids = [...parents, ...replies].map((c) => c.id);
      if (ids.length) {
        const rows = await db
          .select({ commentId: articleCommentVotes.commentId, value: articleCommentVotes.value })
          .from(articleCommentVotes)
          .where(and(eq(articleCommentVotes.userId, req.user.id), inArray(articleCommentVotes.commentId, ids)));
        for (const r of rows) myVotes.set(r.commentId, r.value);
      }
    }
    const mapComment = (c: (typeof parents)[number]) => ({ ...c, author: author(c.author), myVote: myVotes.get(c.id) ?? 0 });
    return {
      comments: parents.map((p) => ({ ...mapComment(p), replies: replies.filter((r) => r.parentId === p.id).map(mapComment) })),
      page,
      totalPages: Math.max(1, Math.ceil(total / COMMENTS_PER_PAGE)),
      total: article.commentCount,
    };
  });

  app.post(
    "/api/articles/:id/comments",
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
      await getArticle(id);
      let parent: { id: number; userId: number } | null = null;
      if (parentId) {
        const [p] = await db
          .select({ id: articleComments.id, userId: articleComments.userId, articleId: articleComments.articleId, parentId: articleComments.parentId })
          .from(articleComments)
          .where(eq(articleComments.id, parentId))
          .limit(1);
        if (!p || p.articleId !== id) throw notFound("Bình luận gốc không tồn tại.");
        parent = p.parentId ? { id: p.parentId, userId: p.userId } : p;
      }
      const [comment] = await db
        .insert(articleComments)
        .values({ articleId: id, userId: user.id, content, parentId: parent?.id ?? null })
        .returning();
      await db.update(articles).set({ commentCount: sql`${articles.commentCount} + 1` }).where(eq(articles.id, id));
      if (parent) await notify([{ userId: parent.userId, type: "comment_reply", actorId: user.id, articleId: id, commentId: comment.id }]);
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
    "/api/articles/comments/:id/vote",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
      const user = requireActive(req);
      const { id } = parse(idParam, req.params);
      const { value } = parse(voteBody, req.body);
      const [comment] = await db.select({ userId: articleComments.userId }).from(articleComments).where(eq(articleComments.id, id)).limit(1);
      if (!comment) throw notFound("Bình luận không tồn tại.");
      if (comment.userId === user.id) throw badRequest("Không thể tự đánh giá bình luận của mình.");
      return db.transaction(async (tx) => {
        const [prev] = await tx
          .select({ value: articleCommentVotes.value })
          .from(articleCommentVotes)
          .where(and(eq(articleCommentVotes.commentId, id), eq(articleCommentVotes.userId, user.id)))
          .limit(1);
        const before = prev?.value ?? 0;
        if (value === 0) {
          await tx.delete(articleCommentVotes).where(and(eq(articleCommentVotes.commentId, id), eq(articleCommentVotes.userId, user.id)));
        } else {
          await tx
            .insert(articleCommentVotes)
            .values({ commentId: id, userId: user.id, value })
            .onConflictDoUpdate({ target: [articleCommentVotes.commentId, articleCommentVotes.userId], set: { value } });
        }
        const likeDelta = (value === 1 ? 1 : 0) - (before === 1 ? 1 : 0);
        const dislikeDelta = (value === -1 ? 1 : 0) - (before === -1 ? 1 : 0);
        const [c] = await tx
          .update(articleComments)
          .set({
            likeCount: sql`greatest(${articleComments.likeCount} + ${likeDelta}, 0)`,
            dislikeCount: sql`greatest(${articleComments.dislikeCount} + ${dislikeDelta}, 0)`,
          })
          .where(eq(articleComments.id, id))
          .returning({ likeCount: articleComments.likeCount, dislikeCount: articleComments.dislikeCount });
        return { ...c, myVote: value };
      });
    },
  );

  app.delete("/api/articles/comments/:id", async (req, reply) => {
    const user = requireActive(req);
    const { id } = parse(idParam, req.params);
    const [comment] = await db.select().from(articleComments).where(eq(articleComments.id, id)).limit(1);
    if (!comment) throw notFound("Bình luận không tồn tại.");
    if (comment.userId !== user.id && !isStaff(user)) throw forbidden();
    const [{ n: replyCount }] = await db.select({ n: count() }).from(articleComments).where(eq(articleComments.parentId, id));
    await db.delete(articleComments).where(eq(articleComments.id, id));
    await db
      .update(articles)
      .set({ commentCount: sql`greatest(${articles.commentCount} - ${1 + replyCount}, 0)` })
      .where(eq(articles.id, comment.articleId));
    return ok(reply);
  });

  app.get("/api/admin/articles/:id", async (req) => {
    requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const article = await getArticle(id);
    const [images, videos] = await Promise.all([
      db.select().from(articleImages).where(eq(articleImages.articleId, id)).orderBy(asc(articleImages.sortOrder)),
      db.select().from(articleVideos).where(eq(articleVideos.articleId, id)).orderBy(asc(articleVideos.sortOrder)),
    ]);
    return {
      article: {
        id: article.id,
        title: article.title,
        description: article.description,
        watchLink: article.watchLink,
        vipLink: article.vipLink,
        visibility: article.visibility,
        isHot: article.isHot,
        coverType: article.coverType,
        coverImageKey: article.coverImageKey,
        coverDuration: article.coverDuration,
        images: images.map((i) => ({ id: i.id, fileKey: i.fileKey, url: articleImageUrl(i.fileKey), thumbUrl: articleImageUrl(i.fileKey, true) })),
        videos: videos.map((v) => ({ id: v.id, fileKey: v.fileKey, thumbKey: v.thumbKey, url: videoFileUrl(v.fileKey, v.ext), duration: v.duration })),
      },
    };
  });

  /** Creates an article with its metadata. Media is attached afterwards via /media endpoints. */
  app.post(
    "/api/admin/articles",
    { config: { rateLimit: { max: 120, timeWindow: "1 hour" } } },
    async (req) => {
      const user = requireAdmin(req);
      const body = parse(articleBody, req.body);
      const [article] = await db
        .insert(articles)
        .values({
          userId: user.id,
          title: body.title,
          description: body.description,
          watchLink: body.watchLink ?? null,
          vipLink: body.vipLink ?? null,
          visibility: body.visibility,
          isHot: body.isHot,
        })
        .returning({ id: articles.id });
      return { article };
    },
  );

  app.patch("/api/admin/articles/:id", async (req) => {
    requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({
        title: articleBody.shape.title.optional(),
        description: articleBody.shape.description.optional(),
        watchLink: linkField,
        vipLink: linkField,
        visibility: z.enum(VISIBILITIES).optional(),
        isHot: z.boolean().optional(),
      }),
      req.body,
    );
    await getArticle(id);
    if (Object.keys(body).length) await db.update(articles).set(body).where(eq(articles.id, id));
    if (body.visibility === "members") await markMembersOnly(id, true);
    if (body.visibility === "public") await markMembersOnly(id, false);
    return { ok: true };
  });

  app.delete("/api/admin/articles/:id", async (req, reply) => {
    requireAdmin(req);
    const { id } = parse(idParam, req.params);
    await getArticle(id);
    const images = await db.select({ fileKey: articleImages.fileKey }).from(articleImages).where(eq(articleImages.articleId, id));
    const videos = await db.select({ fileKey: articleVideos.fileKey, ext: articleVideos.ext, thumbKey: articleVideos.thumbKey }).from(articleVideos).where(eq(articleVideos.articleId, id));
    await db.delete(articles).where(eq(articles.id, id));
    lastWatched.delete(id);
    for (const img of images) await removeImage("albums", img.fileKey);
    for (const v of videos) {
      membersOnlyKeys.delete(v.fileKey);
      await removeVideoFile(v.fileKey, v.ext);
      if (v.thumbKey) await removeImage("thumbs", v.thumbKey);
    }
    return ok(reply);
  });

  /** Uploads one image into an article. */
  app.post(
    "/api/admin/articles/:id/images",
    { config: { rateLimit: { max: 200, timeWindow: "1 hour" } } },
    async (req) => {
      requireAdmin(req);
      const { id } = parse(idParam, req.params);
      const article = await getArticle(id);
      const [{ maxOrder }] = await db
        .select({ maxOrder: sql<number>`coalesce(max(${articleImages.sortOrder}), 0)::int` })
        .from(articleImages)
        .where(eq(articleImages.articleId, id));
      const file = await req.file({ limits: { fileSize: config.maxUploadMb * 1024 * 1024 } });
      if (!file) throw badRequest("Chưa chọn ảnh.");
      const stored = await storeImage("albums", await file.toBuffer());
      const [img] = await db
        .insert(articleImages)
        .values({ articleId: id, fileKey: stored.key, width: stored.width, height: stored.height, sortOrder: maxOrder + 1 })
        .returning();
      await db.update(articles).set({ imageCount: sql`${articles.imageCount} + 1` }).where(eq(articles.id, id));
      // First image becomes the cover unless the admin picked another one.
      if (article.coverType === "none") await setCover(id, "image", stored.key, 0);
      return { image: { id: img.id, url: articleImageUrl(img.fileKey), thumbUrl: articleImageUrl(img.fileKey, true) } };
    },
  );

  app.delete("/api/admin/articles/:id/images/:imageId", async (req, reply) => {
    requireAdmin(req);
    const { id, imageId } = parse(
      z.object({ id: z.coerce.number().int().positive(), imageId: z.coerce.number().int().positive() }),
      req.params,
    );
    const article = await getArticle(id);
    const [img] = await db
      .delete(articleImages)
      .where(and(eq(articleImages.id, imageId), eq(articleImages.articleId, id)))
      .returning();
    if (!img) throw notFound("Ảnh không tồn tại.");
    await db.update(articles).set({ imageCount: sql`greatest(${articles.imageCount} - 1, 0)` }).where(eq(articles.id, id));
    // Ảnh bìa vừa bị xoá => chọn lại media còn lại, nếu không bài mất ảnh bìa (B21).
    if (article.coverImageKey === img.fileKey) await resolveCover(id);
    await removeImage("albums", img.fileKey);
    return ok(reply);
  });

  /** Uploads one video into an article (streamed to disk). */
  app.post(
    "/api/admin/articles/:id/videos",
    {
      bodyLimit: (config.maxVideoMb + 20) * MB,
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 hour",
          // The import of the old system sends the secret header.
          allowList: (req) => isImportRequest(req.headers),
        },
      },
    },
    async (req) => {
      requireAdmin(req);
      const { id } = parse(idParam, req.params);
      const article = await getArticle(id);
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

        const duration = Math.round(Number(fields.duration || 0));
        const width = Math.round(Number(fields.width || 0));
        const height = Math.round(Number(fields.height || 0));
        const thumbKey = thumb?.length ? (await storeImage("thumbs", thumb)).key : null;
        const finalPath = path.join(dir, `${saved.key}.${saved.ext}`);
        await rename(saved.tmp, finalPath);
        cleanup.push(finalPath);
        if (article.visibility === "members") membersOnlyKeys.add(saved.key);
        const [{ maxOrder }] = await db
          .select({ maxOrder: sql<number>`coalesce(max(${articleVideos.sortOrder}), 0)::int` })
          .from(articleVideos)
          .where(eq(articleVideos.articleId, id));
        const [video] = await db
          .insert(articleVideos)
          .values({
            articleId: id,
            fileKey: saved.key,
            ext: saved.ext,
            thumbKey,
            duration,
            width,
            height,
            sizeBytes: saved.size,
            sortOrder: maxOrder + 1,
          })
          .returning({ id: articleVideos.id });
        cleanup.length = 0;
        await db.update(articles).set({ videoCount: sql`${articles.videoCount} + 1` }).where(eq(articles.id, id));
        // Video đầu tiên làm ảnh bìa (nếu admin có gửi khung hình). Nếu không có khung hình
        // thì server sẽ tự chụp và đặt bìa sau khi xử lý xong (postProcess).
        if (article.coverType === "none" && thumbKey) await setCover(id, "video", thumbKey, duration);
        void postProcess(video.id, id, finalPath, saved.ext, !duration || !width, !thumbKey, (msg) => req.log.info(msg));
        return { video: { id: video.id, url: videoFileUrl(saved.key, saved.ext), thumbUrl: articleThumbUrl(thumbKey), duration } };
      } finally {
        for (const file of cleanup) await rm(file, { force: true });
      }
    },
  );

  app.delete("/api/admin/articles/:id/videos/:videoId", async (req, reply) => {
    requireAdmin(req);
    const { id, videoId } = parse(
      z.object({ id: z.coerce.number().int().positive(), videoId: z.coerce.number().int().positive() }),
      req.params,
    );
    const article = await getArticle(id);
    const [video] = await db
      .delete(articleVideos)
      .where(and(eq(articleVideos.id, videoId), eq(articleVideos.articleId, id)))
      .returning();
    if (!video) throw notFound("Video không tồn tại.");
    await db.update(articles).set({ videoCount: sql`greatest(${articles.videoCount} - 1, 0)` }).where(eq(articles.id, id));
    // Khung hình đang làm bìa vừa bị xoá => chọn lại media còn lại (B21).
    if (article.coverType === "video" && article.coverImageKey === video.thumbKey) await resolveCover(id);
    membersOnlyKeys.delete(video.fileKey);
    await removeVideoFile(video.fileKey, video.ext);
    if (video.thumbKey) await removeImage("thumbs", video.thumbKey);
    return ok(reply);
  });

  /** Picks which media shows as the cover of an article in listings. */
  app.post("/api/admin/articles/:id/cover", async (req) => {
    requireAdmin(req);
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({
        type: z.enum(["none", "image", "video"]),
        imageId: z.number().int().positive().optional(),
        videoId: z.number().int().positive().optional(),
      }),
      req.body,
    );
    const article = await getArticle(id);
    if (body.type === "image") {
      if (!body.imageId) throw badRequest("Chưa chọn ảnh bìa.");
      const [img] = await db
        .select({ id: articleImages.id, fileKey: articleImages.fileKey })
        .from(articleImages)
        .where(and(eq(articleImages.id, body.imageId), eq(articleImages.articleId, id)))
        .limit(1);
      if (!img) throw badRequest("Ảnh không thuộc bài viết này.");
      await setCover(id, "image", img.fileKey, 0);
      return { ok: true };
    }
    if (body.type === "video") {
      if (!body.videoId) throw badRequest("Chưa chọn video bìa.");
      const [v] = await db
        .select({ id: articleVideos.id, thumbKey: articleVideos.thumbKey, duration: articleVideos.duration })
        .from(articleVideos)
        .where(and(eq(articleVideos.id, body.videoId), eq(articleVideos.articleId, id)))
        .limit(1);
      if (!v) throw badRequest("Video không thuộc bài viết này.");
      // Video chưa có khung hình thì không làm bìa được — bìa sẽ trỏ tới file không
      // tồn tại và bài mất ảnh bìa (B21). Trả lỗi rõ ràng cho admin.
      if (!v.thumbKey) {
        throw badRequest("Video này chưa có khung hình. Hãy tải video kèm khung hình, hoặc dùng ffmpeg để lấy khung hình trên máy chủ.");
      }
      await setCover(id, "video", v.thumbKey, v.duration);
      return { ok: true };
    }
    await setCover(id, "none", null, 0);
    return { ok: true, articleId: article.id };
  });
}

/** Sets the cover of an article. `key` is an image file key or a video thumbnail key. */
async function setCover(articleId: number, type: "none" | "image" | "video", key: string | null, duration: number) {
  await db
    .update(articles)
    .set({ coverType: type, coverImageKey: key, coverDuration: type === "video" ? duration : 0 })
    .where(eq(articles.id, articleId));
}

/**
 * Chọn lại ảnh bìa từ media còn tồn tại (B21).
 *
 * Bìa phải luôn trỏ tới một file thật, nếu không bài viết mất ảnh bìa trên thẻ và
 * banner trượt. Dùng sau khi xoá ảnh / video đang làm bìa, và khi admin chọn một
 * video chưa có khung hình làm bìa.
 */
async function resolveCover(articleId: number): Promise<"image" | "video" | "none"> {
  const [img] = await db
    .select({ fileKey: articleImages.fileKey })
    .from(articleImages)
    .where(eq(articleImages.articleId, articleId))
    .orderBy(asc(articleImages.sortOrder), asc(articleImages.id))
    .limit(1);
  if (img) {
    await setCover(articleId, "image", img.fileKey, 0);
    return "image";
  }
  const [vid] = await db
    .select({ thumbKey: articleVideos.thumbKey, duration: articleVideos.duration })
    .from(articleVideos)
    .where(and(eq(articleVideos.articleId, articleId), isNotNull(articleVideos.thumbKey)))
    .orderBy(asc(articleVideos.sortOrder), asc(articleVideos.id))
    .limit(1);
  if (vid?.thumbKey) {
    await setCover(articleId, "video", vid.thumbKey, vid.duration);
    return "video";
  }
  await setCover(articleId, "none", null, 0);
  return "none";
}

/** Marks every video of an article as members-only (or public) in the in-memory key set. */
async function markMembersOnly(articleId: number, members: boolean) {
  const rows = await db.select({ fileKey: articleVideos.fileKey }).from(articleVideos).where(eq(articleVideos.articleId, articleId));
  for (const r of rows) {
    if (members) membersOnlyKeys.add(r.fileKey);
    else membersOnlyKeys.delete(r.fileKey);
  }
}
