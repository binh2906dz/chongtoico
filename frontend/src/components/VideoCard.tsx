import { Link } from "react-router-dom";
import { compactNumber, formatDuration, imageVariant, isNew, timeAgo } from "../format";
import type { VideoItem } from "../types";
import { Empty } from "./ui";

const CARD_SIZES = "(min-width: 1024px) 280px, (min-width: 640px) 33vw, 50vw";

export function VideoThumb({ url, alt, sizes = CARD_SIZES, eager = false }: { url: string; alt: string; sizes?: string; eager?: boolean }) {
  return (
    <img
      src={url}
      srcSet={`${imageVariant(url, "s")} 480w, ${url} 1280w`}
      sizes={sizes}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
    />
  );
}

export function VideoCard({
  video,
  onRemove,
  removeTitle = "Xoá khỏi lịch sử",
  showRecent = false,
}: {
  video: VideoItem;
  onRemove?: () => void;
  removeTitle?: string;
  showRecent?: boolean;
}) {
  const fresh = isNew(video.createdAt);
  return (
    <div className="group relative">
      <Link to={`/video/${video.id}`} className="block">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-panel-2 ring-1 ring-line transition duration-300 group-hover:shadow-xl group-hover:shadow-brand/20 group-hover:ring-brand/70">
          {video.thumbUrl ? (
            <VideoThumb url={video.thumbUrl} alt={video.title} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-4xl text-muted">🎬</div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100">
            <span className="flex h-12 w-12 scale-75 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-2 pl-1 text-xl text-white shadow-lg shadow-brand/40 transition duration-300 group-hover:scale-100">
              ▶
            </span>
          </span>
          <span className="absolute top-2 left-2 flex flex-wrap gap-1">
            {video.hot && <span className="badge bg-gradient-to-r from-brand to-brand-2 text-white">🔥 Hot</span>}
            {fresh && <span className="badge bg-emerald-500 text-white">Mới</span>}
            {video.membersOnly && <span className="badge bg-black/75 text-sky-300">🔒 TV</span>}
          </span>
          {video.width >= 1280 && (
            <span className="badge absolute top-2 right-2 border border-white/30 bg-black/60 text-white">{video.height >= 1080 || video.width >= 1920 ? "FHD" : "HD"}</span>
          )}
          <span className="absolute bottom-2 left-2 flex items-center gap-1 text-xs font-semibold text-white drop-shadow">
            {showRecent && video.recentViews ? (
              <span className="text-pink-200">🔥 {compactNumber(video.recentViews)} hôm nay</span>
            ) : video.viewCount > 0 ? (
              <span>👁 {compactNumber(video.viewCount)}</span>
            ) : null}
          </span>
          {video.duration > 0 && (
            <span className="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-bold text-white">{formatDuration(video.duration)}</span>
          )}
        </div>
        <div className="mt-2 line-clamp-2 text-[13px] leading-snug font-bold text-slate-100 transition group-hover:text-brand sm:text-sm">{video.title}</div>
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
        {video.rating !== null && <span className="font-semibold text-emerald-400">👍 {video.rating}%</span>}
        {video.rating !== null && <span>·</span>}
        {video.category && (
          <>
            <Link to={`/video/the-loai/${video.category.slug}`} className="hover:text-brand">
              {video.category.name}
            </Link>
            <span>·</span>
          </>
        )}
        <span>{timeAgo(video.viewedAt ?? video.createdAt)}</span>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 hidden h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-black/80 text-sm text-white group-hover:flex"
          title={removeTitle}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function VideoGrid({
  videos,
  empty = "Chưa có video nào.",
  onRemove,
  removeTitle,
  dense = false,
  showRecent = false,
}: {
  videos: VideoItem[];
  empty?: string;
  onRemove?: (v: VideoItem) => void;
  removeTitle?: string;
  dense?: boolean;
  showRecent?: boolean;
}) {
  if (!videos.length) return <Empty>{empty}</Empty>;
  return (
    <div className={`grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 ${dense ? "" : "lg:grid-cols-4"}`}>
      {videos.map((v) => (
        <VideoCard
          key={v.id}
          video={v}
          onRemove={onRemove ? () => onRemove(v) : undefined}
          removeTitle={removeTitle}
          showRecent={showRecent}
        />
      ))}
    </div>
  );
}
