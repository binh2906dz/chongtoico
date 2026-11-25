import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { isAdmin, useAuth } from "../auth";
import { ErrorBox, Pagination, Tabs, VideoGridSkeleton } from "../components/ui";
import { ArticleGrid } from "../components/ArticleCard";
import { formatNumber } from "../format";
import { useFetch } from "../useFetch";
import type { ArticleItem } from "../types";

export const SORT_TABS = [
  { id: "hom-nay", api: "today", label: "Xem nhiều hôm nay" },
  { id: "moi", api: "new", label: "Mới nhất" },
  { id: "tuan", api: "week", label: "Hay nhất tuần" },
  { id: "hay", api: "best", label: "Hay nhất" },
  { id: "hot", api: "hot", label: "Hot 7 ngày" },
  { id: "ngau-nhien", api: "random", label: "🔀 Ngẫu nhiên" },
] as const;
type SortId = (typeof SORT_TABS)[number]["id"];

export default function Articles() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const sortId = (SORT_TABS.find((t) => t.id === params.get("sap-xep"))?.id ?? "moi") as SortId;
  const sort = SORT_TABS.find((t) => t.id === sortId)!.api;
  const page = Math.max(1, Number(params.get("trang")) || 1);
  const q = params.get("q")?.trim() ?? "";
  const [draft, setDraft] = useState(q);

  const query = new URLSearchParams({ sort, page: String(page) });
  if (q) query.set("q", q);
  const [shuffle, setShuffle] = useState(0);
  const { data, error, loading } = useFetch<{
    articles: ArticleItem[];
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

  const title = q ? `Kết quả tìm "${q}"` : "Bài viết";

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
        </div>
      </div>
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
