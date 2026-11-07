import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ErrorBox, Pagination, Spinner, Tabs } from "../components/ui";
import { VideoGrid } from "../components/VideoCard";
import { formatNumber } from "../format";
import { useFetch } from "../useFetch";
import type { VideoCategory, VideoItem } from "../types";

export const SORT_TABS = [
  { id: "hom-nay", api: "today", label: "Xem nhiều hôm nay" },
  { id: "moi", api: "new", label: "Mới nhất" },
  { id: "hay", api: "best", label: "Hay nhất" },
  { id: "hot", api: "hot", label: "Hot nhất" },
] as const;
type SortId = (typeof SORT_TABS)[number]["id"];

export function VideoCategoryBar({ active }: { active?: string }) {
  const { data } = useFetch<{ categories: VideoCategory[] }>("/api/videos/categories");
  if (!data?.categories.length) return null;
  const chip = (to: string, label: string, on: boolean) => (
    <Link
      key={to}
      to={to}
      className={`shrink-0 rounded-full border px-3 py-1 text-sm whitespace-nowrap ${
        on ? "border-brand bg-brand/15 font-semibold text-brand" : "border-line text-slate-300 hover:border-brand/50 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="scroll-thin flex gap-2 overflow-x-auto pb-1">
      {chip("/video", "Tất cả", !active)}
      {data.categories.map((c) => chip(`/video/the-loai/${c.slug}`, c.name, active === c.slug))}
    </div>
  );
}

export default function Videos() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const sortId = (SORT_TABS.find((t) => t.id === params.get("sap-xep"))?.id ?? "moi") as SortId;
  const sort = SORT_TABS.find((t) => t.id === sortId)!.api;
  const page = Math.max(1, Number(params.get("trang")) || 1);
  const q = params.get("q")?.trim() ?? "";
  const [draft, setDraft] = useState(q);

  const query = new URLSearchParams({ sort, page: String(page) });
  if (slug) query.set("category", slug);
  if (q) query.set("q", q);
  const { data, error, loading } = useFetch<{ videos: VideoItem[]; category: VideoCategory | null; page: number; totalPages: number; total: number }>(
    `/api/videos?${query}`,
  );

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

  const title = q ? `Kết quả tìm "${q}"` : data?.category ? `Thể loại: ${data.category.name}` : "Video";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">
          {title}
          {data && <span className="ml-2 text-sm font-normal text-muted">({formatNumber(data.total)} video)</span>}
        </h1>
        <div className="flex flex-wrap gap-2">
          <form onSubmit={search} className="flex gap-2">
            <input className="input w-56 py-1.5" placeholder="Tìm video..." value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button className="btn-ghost px-3 py-1.5">Tìm</button>
          </form>
          <Link to="/video/da-xem" className="btn-ghost px-3 py-1.5">
            🕘 Đã xem
          </Link>
        </div>
      </div>
      <VideoCategoryBar active={slug} />
      <Tabs
        tabs={SORT_TABS.map((t) => ({ id: t.id, label: t.label }))}
        value={sortId}
        onChange={(id) => update({ "sap-xep": id === "moi" ? null : id, trang: null })}
      />
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : (
        <VideoGrid videos={data?.videos ?? []} empty={q ? "Không tìm thấy video phù hợp." : "Chưa có video nào."} />
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={(p) => update({ trang: p > 1 ? String(p) : null })} />}
    </div>
  );
}
