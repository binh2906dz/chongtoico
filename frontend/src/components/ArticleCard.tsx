import { useState } from "react";
import { Link } from "react-router-dom";
import { compactNumber, coverVariants, formatDuration, isNew, timeAgo } from "../format";
import type { ArticleItem } from "../types";
import { Empty } from "./ui";

const CARD_SIZES = "(min-width: 1024px) 280px, (min-width: 640px) 33vw, 50vw";

export function ArticleThumb({ url, alt, sizes = CARD_SIZES, eager = false }: { url: string; alt: string; sizes?: string; eager?: boolean }) {
  // Ảnh bài "chỉ thành viên" trả 403 cho khách -> hiện ô trống thay vì ảnh vỡ.
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="h-full w-full bg-panel-2" />;
  const variants = coverVariants(url);
  return (
    <img
      src={variants?.large ?? url}
      srcSet={variants ? `${variants.small} 480w, ${variants.large} 1280w, ${variants.full} ${variants.fullWidth}w` : undefined}
      sizes={sizes}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
    />
  );
}

/** Ảnh bìa của bài viết: ảnh do admin chọn, có thể là ảnh hoặc khung hình của video. */
export function ArticleCover({ article, sizes = CARD_SIZES, eager = false }: { article: ArticleItem; sizes?: string; eager?: boolean }) {
  if (!article.coverUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center text-4xl text-muted">
        {article.membersOnly ? "🔒" : article.imageCount > 0 ? "🖼️" : article.videoCount > 0 ? "🎬" : "📝"}
      </div>
    );
  }
  return <ArticleThumb url={article.coverUrl} alt={article.title} sizes={sizes} eager={eager} />;
}

export function ArticleCard({
  article,
  onRemove,
  removeTitle = "Xoá khỏi lịch sử",
  showRecent = false,
}: {
  article: ArticleItem;
  onRemove?: () => void;
  removeTitle?: string;
  showRecent?: boolean;
}) {
  const fresh = isNew(article.createdAt);
  const media = article.imageCount + article.videoCount;
  return (
    <div className="group relative">
      <Link to={`/bai-viet/${article.id}`} className="block">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-panel-2 ring-1 ring-line transition duration-300 group-hover:shadow-xl group-hover:shadow-brand/20 group-hover:ring-brand/70">
          <ArticleCover article={article} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
          {article.hasVideo && (
            <span className="absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100">
              <span className="flex h-12 w-12 scale-75 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-2 pl-1 text-xl text-white shadow-lg shadow-brand/40 transition duration-300 group-hover:scale-100">
                ▶
              </span>
            </span>
          )}
          <span className="absolute top-2 left-2 flex flex-wrap gap-1">
            {article.priority && <span className="badge bg-gradient-to-r from-amber-400 to-yellow-500 text-black">⭐ Ưu tiên</span>}
            {article.hot && <span className="badge bg-gradient-to-r from-brand to-brand-2 text-white">🔥 Hot</span>}
            {fresh && <span className="badge bg-emerald-500 text-white">Mới</span>}
            {article.membersOnly && <span className="badge bg-black/75 text-sky-300">🔒 TV</span>}
          </span>
          {media > 0 && (
            <span className="badge absolute top-2 right-2 border border-white/30 bg-black/60 text-white normal-case">
              {article.imageCount > 0 && `🖼️ ${article.imageCount}`} {article.videoCount > 0 && `🎬 ${article.videoCount}`}
            </span>
          )}
          <span className="absolute bottom-2 left-2 flex items-center gap-1 text-xs font-semibold text-white drop-shadow">
            {showRecent && article.recentViews ? (
              <span className="text-pink-200">🔥 {compactNumber(article.recentViews)} hôm nay</span>
            ) : article.viewCount > 0 ? (
              <span>👁 {compactNumber(article.viewCount)}</span>
            ) : null}
          </span>
          {article.coverDuration > 0 && (
            <span className="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-bold text-white">{formatDuration(article.coverDuration)}</span>
          )}
        </div>
        <div className="mt-2 line-clamp-2 text-[13px] leading-snug font-bold text-slate-100 transition group-hover:text-brand sm:text-sm">{article.title}</div>
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
        {article.rating !== null && <span className="font-semibold text-emerald-400">👍 {article.rating}%</span>}
        {article.rating !== null && <span>·</span>}
        <span>{timeAgo(article.viewedAt ?? article.createdAt)}</span>
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

export function ArticleGrid({
  articles,
  empty = "Chưa có bài viết nào.",
  onRemove,
  removeTitle,
  dense = false,
  showRecent = false,
}: {
  articles: ArticleItem[];
  empty?: string;
  onRemove?: (a: ArticleItem) => void;
  removeTitle?: string;
  dense?: boolean;
  showRecent?: boolean;
}) {
  if (!articles.length) return <Empty>{empty}</Empty>;
  return (
    <div className={`grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 ${dense ? "" : "lg:grid-cols-4"}`}>
      {articles.map((a) => (
        <ArticleCard
          key={a.id}
          article={a}
          onRemove={onRemove ? () => onRemove(a) : undefined}
          removeTitle={removeTitle}
          showRecent={showRecent}
        />
      ))}
    </div>
  );
}
