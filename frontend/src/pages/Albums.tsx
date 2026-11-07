import { useState } from "react";
import { Link } from "react-router-dom";
import { AlbumGridSkeleton, ErrorBox, Pagination, Tabs } from "../components/ui";
import { formatNumber, isNew, timeAgo } from "../format";
import { usePage } from "../usePage";
import { useFetch } from "../useFetch";
import type { Album } from "../types";

export function AlbumCard({ album }: { album: Album }) {
  return (
    <Link
      to={`/album/${album.id}`}
      className="group relative block aspect-[3/4] overflow-hidden rounded-xl bg-panel-2 ring-1 ring-line transition duration-300 hover:shadow-xl hover:shadow-brand/20 hover:ring-brand/70"
    >
      {album.coverUrl ? (
        <img
          src={album.coverUrl}
          alt={album.title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted">
          <span className="text-4xl">{album.locked ? "🔒" : "🖼️"}</span>
          <span className="text-xs">{album.locked ? "Đăng nhập để xem" : "Chưa có ảnh"}</span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />
      <div className="absolute top-2 left-2 flex flex-wrap gap-1">
        {album.isHot && <span className="badge bg-gradient-to-r from-brand to-brand-2 text-white">🔥 Hot</span>}
        {isNew(album.createdAt) && <span className="badge bg-emerald-500 text-white">Mới</span>}
        {album.visibility === "members" && <span className="badge bg-black/75 text-sky-300">🔒 TV</span>}
      </div>
      <span className="badge absolute top-2 right-2 bg-black/70 text-white normal-case">📸 {album.imageCount}</span>
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="line-clamp-2 text-sm leading-snug font-bold text-white drop-shadow transition group-hover:text-pink-200">{album.title}</div>
        <div className="mt-1 text-[11px] text-slate-300">
          {album.viewCount > 0 && `👁 ${formatNumber(album.viewCount)} · `}
          {timeAgo(album.createdAt)}
        </div>
      </div>
    </Link>
  );
}

export default function Albums() {
  const [sort, setSort] = useState<"new" | "views">("new");
  const [page, setPage] = usePage();
  const { data, error, loading } = useFetch<{ albums: Album[]; page: number; totalPages: number }>(`/api/albums?sort=${sort}&page=${page}`);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">Kho album</h1>
        <Tabs
          tabs={[
            { id: "new", label: "Mới nhất" },
            { id: "views", label: "Xem nhiều" },
          ]}
          value={sort}
          onChange={(s) => {
            setSort(s);
            setPage(1);
          }}
        />
      </div>
      {loading && !data ? (
        <AlbumGridSkeleton />
      ) : error ? (
        <ErrorBox message={error} />
      ) : !data?.albums.length ? (
        <div className="panel p-10 text-center text-muted">Kho album đang trống.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.albums.map((a) => (
            <AlbumCard key={a.id} album={a} />
          ))}
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}
