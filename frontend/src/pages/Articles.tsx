import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { isAdmin, useAuth } from "../auth";
import { ErrorBox, Pagination, Tabs, VideoGridSkeleton } from "../components/ui";
import { ArticleGrid } from "../components/ArticleCard";
import { formatNumber } from "../format";
import { useFetch } from "../useFetch";
import type { ArticleCategory, ArticleItem, ArticleTag } from "../types";

export const SORT_TABS = [
  { id: "hom-nay", api: "today", label: "Xem nhiều hôm nay" },
  { id: "moi", api: "new", label: "Mới nhất" },
  { id: "tuan", api: "week", label: "Hay nhất tuần" },
  { id: "hay", api: "best", label: "Hay nhất" },
  { id: "hot", api: "hot", label: "Hot 7 ngày" },
  { id: "ngau-nhien", api: "random", label: "🔀 Ngẫu nhiên" },
] as const;
type SortId = (typeof SORT_TABS)[number]["id"];

export function ArticleCategoryBar({ active }: { active?: string }) {
  const { data } = useFetch<{ categories: ArticleCategory[] }>("/api/articles/categories");
  if (!data?.categories.length) return null;
  const chip = (to: string, label: string, on: boolean) => (
    <Link
      key={to}
      to={to}
      className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition ${
        on
          ? "border-transparent bg-gradient-to-r from-brand to-brand-2 text-white shadow-md shadow-brand/25"
          : "border-line bg-panel text-slate-300 hover:border-brand/60 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {chip("/bai-viet", "Tất cả", !active)}
      {data.categories.map((c) => chip(`/bai-viet/the-loai/${c.slug}`, c.name, active === c.slug))}
    </div>
  );
}

export function TagCloud({ tags, limit }: { tags: ArticleTag[]; limit?: number }) {
  if (!tags.length) return null;
  const max = Math.max(...tags.map((t) => t.articleCount ?? 1));
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.slice(0, limit).map((t) => {
        const weight = (t.articleCount ?? 1) / max;
        return (
          <Link
            key={t.id}
            to={`/bai-viet/tag/${t.slug}`}
            className="rounded-full border border-line bg-panel px-3 py-1 text-slate-300 transition hover:border-brand/60 hover:bg-brand/10 hover:text-brand"
            style={{ fontSize: `${0.75 + weight * 0.35}rem` }}
          >
            #{t.name}
            {t.articleCount ? <span className="ml-1 text-[10px] text-muted">{t.articleCount}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}

export function ArticleTags() {
  const { data, error, loading } = useFetch<{ tags: ArticleTag[] }>("/api/articles/tags?limit=300");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">🏷️ Thẻ bài viết</h1>
      {loading && !data ? (
        <div className="panel flex flex-wrap gap-2 p-4">
          {Array.from({ length: 24 }, (_, i) => (
            <div key={i} className="skeleton h-7 w-20 rounded-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorBox message={error} />
      ) : data?.tags.length ? (
        <div className="panel p-4">
          <TagCloud tags={data.tags} />
        </div>
      ) : (
        <div className="panel p-8 text-center text-sm text-muted">Chưa có thẻ nào.</div>
      )}
    </div>
  );
}

export default function Articles() {
  const { user } = useAuth();
  const { slug, tag: tagSlug } = useParams();
  const [params, setParams] = useSearchParams();
  const sortId = (SORT_TABS.find((t) => t.id === params.get("sap-xep"))?.id ?? "moi") as SortId;
  const sort = SORT_TABS.find((t) => t.id === sortId)!.api;
  const page = Math.max(1, Number(params.get("trang")) || 1);
  const q = params.get("q")?.trim() ?? "";
  const [draft, setDraft] = useState(q);

  const query = new URLSearchParams({ sort, page: String(page) });
  if (slug) query.set("category", slug);
  if (tagSlug) query.set("tag", tagSlug);
  if (q) query.set("q", q);
  const [shuffle, setShuffle] = useState(0);
  const { data, error, loading } = useFetch<{
    articles: ArticleItem[];
    category: ArticleCategory | null;
    tag: ArticleTag | null;
    page: number;
    totalPages: number;
    total: number;
  }>(`/api/articles?${query}${sort === "random" ? `&r=${shuffle}` : ""}`);

  function update(next: Record<string, string | null>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p);
    window.scrollTo(0, 0);
  }

  function search(e: FormEvent) {
    e.preventDefault();
    update({ q: draft.trim() || null, trang: null });
  }

  const title = q
    ? `Kết quả tìm "${q}"`
    : data?.category
      ? `Thể loại: ${data.category.name}`
      : data?.tag
        ? `Thẻ: #${data.tag.name}`
        : "Bài viết";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">
          {title}
          {data && <span className="ml-2 text-sm font-normal text-muted">({formatNumber(data.total)} bài viết)</span>}
        </h1>
        <div className="flex flex-wrap gap-2">
          {isAdmin(user) && (
            <Link to="/quan-tri?tab=bai-viet" className="btn-primary px-3 py-1.5">
              ⬆️ Đăng bài viết
            </Link>
          )}
          {isAdmin(user) && (
            <Link to="/tao-chu-de" className="btn-ghost px-3 py-1.5">
              ✍️ Đăng chủ đề
            </Link>
          )}
          <form onSubmit={search} className="flex gap-2">
            <input className="input w-56 py-1.5" placeholder="Tìm bài viết..." value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button className="btn-ghost px-3 py-1.5">Tìm</button>
          </form>
          <Link to="/bai-viet/yeu-thich" className="btn-ghost px-3 py-1.5">
            ❤️ Yêu thích
          </Link>
          <Link to="/bai-viet/da-xem" className="btn-ghost px-3 py-1.5">
            🕘 Đã xem
          </Link>
          <Link to="/bai-viet/tag" className="btn-ghost px-3 py-1.5">
            🏷️ Thẻ
          </Link>
        </div>
      </div>
      <ArticleCategoryBar active={slug} />
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          tabs={SORT_TABS.map((t) => ({ id: t.id, label: t.label }))}
          value={sortId}
          onChange={(id) => update({ "sap-xep": id === "moi" ? null : id, trang: null })}
        />
        {sort === "random" && (
          <button className="btn-ghost px-3 py-1 text-sm" onClick={() => setShuffle((s) => s + 1)}>
            Đổi lượt khác
          </button>
        )}
      </div>
      {loading ? (
        <VideoGridSkeleton count={12} />
      ) : error ? (
        <ErrorBox message={error} />
      ) : (
        <ArticleGrid
          articles={data?.articles ?? []}
          empty={q ? "Không tìm thấy bài viết phù hợp." : "Chưa có bài viết nào."}
          showRecent={sort === "today"}
        />
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={(p) => update({ trang: p > 1 ? String(p) : null })} />}
    </div>
  );
}
