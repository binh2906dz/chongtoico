import { Link } from "react-router-dom";
import { compactNumber, formatDuration, timeAgo } from "../format";
import type { VideoItem } from "../types";
import { Empty } from "./ui";

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
  return (
    <div className="group relative">
      <Link to={`/video/${video.id}`} className="block">
        <div className="relative aspect-video overflow-hidden rounded-lg border border-line bg-panel-2">
          {video.thumbUrl ? (
            <img src={video.thumbUrl} alt={video.title} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-4xl text-muted">🎬</div>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/90 text-xl text-white">▶</span>
          </span>
          <span className="absolute top-1.5 left-1.5 flex gap-1">
            {video.width >= 1280 && <span className="rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-black text-amber-300">HD</span>}
            {video.membersOnly && <span className="rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-black text-sky-300">🔒 Thành viên</span>}
          </span>
          {video.duration > 0 && (
            <span className="absolute right-1.5 bottom-1.5 rounded bg-black/80 px-1.5 py-0.5 text-xs font-semibold text-white">
              {formatDuration(video.duration)}
            </span>
          )}
        </div>
        <div className="mt-2 line-clamp-2 text-sm leading-snug font-semibold text-slate-100 group-hover:text-brand">{video.title}</div>
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
        {video.rating !== null && <span className="font-semibold text-emerald-400">👍 {video.rating}%</span>}
        {showRecent && video.recentViews ? (
          <span className="font-semibold text-amber-300">🔥 {compactNumber(video.recentViews)} lượt hôm nay</span>
        ) : (
          <span>{compactNumber(video.viewCount)} lượt xem</span>
        )}
        <span>·</span>
        <span>{timeAgo(video.viewedAt ?? video.createdAt)}</span>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-1.5 right-1.5 hidden h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-black/80 text-sm text-white group-hover:flex"
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
