import { and, count, desc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { author, authorColumns, requireAdmin, requireStaff } from "../auth.js";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { posts, reports, users, articleComments, articles } from "../db/schema.js";
import { badRequest, idParam, notFound, pageQuery, paginate, parse } from "../http.js";
import { adImageUrl, removeImage, storeImage } from "../media.js";
import { emitTo } from "../realtime.js";
import { AD_SLOTS, getSettings, publicSettings, saveSetting, SETTING_KEYS, settingSchemas, type SettingKey } from "../settings.js";

const REPORTS_PER_PAGE = 30;
export const REPORT_TARGETS = ["article", "article_comment", "post", "site"] as const;
export const REPORT_REASONS = ["copyright", "inappropriate", "spam", "error", "other"] as const;
export const REPORT_STATUSES = ["open", "resolved", "dismissed"] as const;

const handler = alias(users, "handler");

const excerpt = (text: string, max = 160) => {
  const plain = text
    .replace(/\[quote(?:=[^\]]*)?\][\s\S]*?\[\/quote\]/gi, "")
    .replace(/\[img:[a-f0-9]+\]/gi, "[ảnh]")
    .replace(/\[\/?[a-z]+(?:=[^\]]*)?\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
};

async function targetExists(type: (typeof REPORT_TARGETS)[number], id: number) {
  if (type === "site") return true;
  const table = type === "article" ? articles : type === "article_comment" ? articleComments : posts;
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  return !!row;
}

type TargetInfo = { label: string; url: string | null; excerpt?: string };

async function describeTargets(rows: { targetType: string; targetId: number }[]) {
  const ids = (type: string) => [...new Set(rows.filter((r) => r.targetType === type).map((r) => r.targetId))];
  const out = new Map<string, TargetInfo>();
  const articleIds = ids("article");
  if (articleIds.length) {
    const list = await db.select({ id: articles.id, title: articles.title }).from(articles).where(inArray(articles.id, articleIds));
    for (const a of list) out.set(`article:${a.id}`, { label: `Bài viết: ${a.title}`, url: `/bai-viet/${a.id}` });
  }
  const commentIds = ids("article_comment");
  if (commentIds.length) {
    const list = await db
      .select({ id: articleComments.id, articleId: articleComments.articleId, content: articleComments.content, username: users.username })
      .from(articleComments)
      .innerJoin(users, eq(users.id, articleComments.userId))
      .where(inArray(articleComments.id, commentIds));
    for (const c of list) {
      out.set(`article_comment:${c.id}`, { label: `Bình luận của ${c.username}`, url: `/bai-viet/${c.articleId}`, excerpt: excerpt(c.content) });
    }
  }
  const postIds = ids("post");
  if (postIds.length) {
    const list = await db
      .select({ id: posts.id, content: posts.content, username: users.username })
      .from(posts)
      .innerJoin(users, eq(users.id, posts.userId))
      .where(inArray(posts.id, postIds));
    for (const p of list) out.set(`post:${p.id}`, { label: `Bài viết của ${p.username}`, url: `/bai/${p.id}`, excerpt: excerpt(p.content) });
  }
  return out;
}

export async function openReportCount() {
  const [{ n }] = await db.select({ n: count() }).from(reports).where(eq(reports.status, "open"));
  return n;
}

export default async function siteRoutes(app: FastifyInstance) {
  app.get("/api/site", async (_req, reply) => {
    reply.header("Cache-Control", "no-cache");
    return publicSettings();
  });

  app.get("/api/admin/settings", async (req) => {
    requireAdmin(req);
    const s = await getSettings();
    return {
      settings: s,
      adImages: Object.fromEntries(AD_SLOTS.map((slot) => [slot, adImageUrl(s.ads[slot].imageKey)])),
    };
  });

  app.put("/api/admin/settings/:key", async (req) => {
    requireAdmin(req);
    const { key } = parse(z.object({ key: z.enum(SETTING_KEYS as [SettingKey, ...SettingKey[]]) }), req.params);
    const value = parse(settingSchemas[key], req.body);
    if (key === "ads") {
      const before = (await getSettings()).ads;
      const next = value as typeof before;
      const kept = new Set(AD_SLOTS.map((s) => next[s].imageKey).filter(Boolean));
      for (const slot of AD_SLOTS) {
        const old = before[slot].imageKey;
        if (old && !kept.has(old)) await removeImage("ads", old);
      }
    }
    await saveSetting(key, value as never);
    return { ok: true, site: await publicSettings() };
  });

  app.post("/api/admin/settings/ad-image", async (req) => {
    requireAdmin(req);
    const file = await req.file({ limits: { fileSize: config.maxUploadMb * 1024 * 1024 } });
    if (!file) throw badRequest("Chưa chọn ảnh.");
    const stored = await storeImage("ads", await file.toBuffer());
    return { key: stored.key, url: adImageUrl(stored.key) };
  });

  app.post(
    "/api/reports",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (req) => {
      const body = parse(
        z.object({
          targetType: z.enum(REPORT_TARGETS),
          targetId: z.number().int().min(0).default(0),
          reason: z.enum(REPORT_REASONS),
          message: z.string().trim().max(2000, "Nội dung tối đa 2.000 ký tự.").default(""),
          contact: z.string().trim().max(200, "Thông tin liên hệ tối đa 200 ký tự.").default(""),
        }),
        req.body,
      );
      if (body.targetType === "site") {
        if (body.message.length < 10) throw badRequest("Vui lòng mô tả nội dung cần gỡ (ít nhất 10 ký tự, kèm đường dẫn).");
        if (body.contact.length < 5) throw badRequest("Vui lòng để lại email hoặc cách liên hệ.");
      } else if (!body.targetId || !(await targetExists(body.targetType, body.targetId))) {
        throw notFound("Nội dung không tồn tại hoặc đã bị xoá.");
      }
      if (body.reason === "other" && body.message.length < 5) throw badRequest("Vui lòng mô tả lý do.");

      const ip = req.ip.slice(0, 64);
      if (body.targetType !== "site") {
        const [dup] = await db
          .select({ id: reports.id })
          .from(reports)
          .where(
            and(
              eq(reports.targetType, body.targetType),
              eq(reports.targetId, body.targetId),
              eq(reports.status, "open"),
              req.user ? eq(reports.userId, req.user.id) : eq(reports.ip, ip),
            ),
          )
          .limit(1);
        if (dup) return { ok: true };
      }
      await db.insert(reports).values({ ...body, userId: req.user?.id ?? null, ip });
      emitTo("staff", "report:new", { open: await openReportCount() });
      return { ok: true };
    },
  );

  app.get("/api/admin/reports", async (req) => {
    requireStaff(req);
    const q = parse(pageQuery.extend({ status: z.enum([...REPORT_STATUSES, "all"]).default("open") }), req.query);
    const where = q.status === "all" ? undefined : eq(reports.status, q.status);
    const { limit, offset } = paginate(q.page, REPORTS_PER_PAGE);
    const [[{ total }], rows] = await Promise.all([
      db.select({ total: count() }).from(reports).where(where),
      db
        .select({
          id: reports.id,
          targetType: reports.targetType,
          targetId: reports.targetId,
          reason: reports.reason,
          message: reports.message,
          contact: reports.contact,
          status: reports.status,
          handledAt: reports.handledAt,
          createdAt: reports.createdAt,
          ip: reports.ip,
          reporter: authorColumns,
          handlerName: handler.username,
        })
        .from(reports)
        .leftJoin(users, eq(users.id, reports.userId))
        .leftJoin(handler, eq(handler.id, reports.handledBy))
        .where(where)
        .orderBy(desc(reports.id))
        .limit(limit)
        .offset(offset),
    ]);
    const targets = await describeTargets(rows);
    return {
      reports: rows.map((r) => ({
        ...r,
        reporter: author(r.reporter?.id ? r.reporter : null),
        target: r.targetType === "site" ? null : (targets.get(`${r.targetType}:${r.targetId}`) ?? { label: "Nội dung đã bị xoá", url: null }),
      })),
      page: q.page,
      totalPages: Math.max(1, Math.ceil(total / REPORTS_PER_PAGE)),
      open: await openReportCount(),
    };
  });

  app.patch("/api/admin/reports/:id", async (req) => {
    const staff = requireStaff(req);
    const { id } = parse(idParam, req.params);
    const { status, sameTarget } = parse(
      z.object({ status: z.enum(REPORT_STATUSES), sameTarget: z.boolean().default(false) }),
      req.body,
    );
    const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!report) throw notFound("Báo cáo không tồn tại.");
    const set = { status, handledBy: status === "open" ? null : staff.id, handledAt: status === "open" ? null : new Date() };
    const where =
      sameTarget && report.targetType !== "site"
        ? and(eq(reports.targetType, report.targetType), eq(reports.targetId, report.targetId), eq(reports.status, "open"))
        : eq(reports.id, id);
    await db.update(reports).set(set).where(or(where, eq(reports.id, id)));
    const open = await openReportCount();
    emitTo("staff", "report:new", { open });
    return { ok: true, open };
  });
}
