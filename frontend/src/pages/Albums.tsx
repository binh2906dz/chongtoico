import { useState } from "react";
import { Link } from "react-router-dom";
import { ErrorBox, Pagination, Spinner, Tabs } from "../components/ui";
import { formatNumber, timeAgo } from "../format";
import { usePage } from "../usePage";
import { useFetch } from "../useFetch";
import type { Album } from "../types";

export function AlbumCard({ album }: { album: Album }) {
  return (
    <Link to={`/album/${album.id}`} className="panel group block overflow-hidden hover:border-brand/50">
      <div className="relative aspect-[3/4] bg-panel-2">
        {album.coverUrl ? (
          <img src={album.coverUrl} alt={album.title} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted">
            <span className="text-4xl">{album.locked ? "🔒" : "🖼️"}</span>
            <span className="text-xs">{album.locked ? "Đăng nhập để xem" : "Chưa có ảnh"}</span>
          </div>
        )}
        <div className="absolute top-2 left-2 flex gap-1">
          {album.isHot && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white uppercase">Hot</span>}
          {album.visibility === "members" && <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">Thành viên</span>}
        </div>
        <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">{album.imageCount} ảnh</span>
      </div>
      <div className="p-3">
        <div className="line-clamp-2 text-sm font-semibold group-hover:text-brand">{album.title}</div>
        <div className="mt-1 text-xs text-muted">
          {formatNumber(album.viewCount)} lượt xem · {timeAgo(album.createdAt)}
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
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : !data?.albums.length ? (
        <div className="panel p-10 text-center text-muted">Kho album đang trống.</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.albums.map((a) => (
            <AlbumCard key={a.id} album={a} />
          ))}
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}
