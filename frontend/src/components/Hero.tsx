import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { compactNumber, coverVariants, formatDuration } from "../format";
import type { ArticleItem } from "../types";

export interface HeroSlide {
  key: string;
  to: string;
  image: string;
  label: string;
  title: string;
  meta: string[];
  cta: string;
}

const AUTOPLAY_MS = 5500;

/** Ảnh bìa của bài viết do admin chọn; chỉ hiện 1 ảnh/video đại diện ở trang chủ. */
export function buildHeroSlides(articles: ArticleItem[], max = 7): HeroSlide[] {
  return articles
    .filter((a) => a.coverUrl)
    .slice(0, max)
    .map((a) => {
      // Hero hiển thị ngang: dùng bản 1280px nếu có, không thì bản gốc.
      const variants = coverVariants(a.coverUrl!);
      return {
        key: `a${a.id}`,
        to: `/bai-viet/${a.id}`,
        image: variants?.large ?? a.coverUrl!,
        label: a.recentViews ? "🔥 Hot hôm nay" : a.hasVideo ? "🎬 Bài viết nổi bật" : "🖼️ Bài viết nổi bật",
        title: a.title,
        meta: [
          ...(a.recentViews ? [`${compactNumber(a.recentViews)} lượt xem hôm nay`] : a.viewCount ? [`${compactNumber(a.viewCount)} lượt xem`] : []),
          ...(a.hasVideo && a.coverDuration > 0 ? [formatDuration(a.coverDuration)] : []),
          ...(a.category ? [a.category.name] : []),
        ],
        cta: a.hasVideo ? "▶ Xem ngay" : "Xem bài viết ›",
      };
    });
}

function TopList({ title, articles }: { title: string; articles: ArticleItem[] }) {
  return (
    <div className="panel hidden flex-col overflow-hidden lg:flex">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-brand to-brand-2" />
        <h2 className="font-black">{title}</h2>
      </div>
      <ol className="flex flex-1 flex-col justify-between gap-1 p-2">
        {articles.slice(0, 5).map((a, i) => (
          <li key={a.id}>
            <Link to={`/bai-viet/${a.id}`} className="group flex items-center gap-3 rounded-lg p-1.5 transition hover:bg-panel-2">
              <span className={`w-6 shrink-0 text-center text-2xl font-black italic ${i < 3 ? "text-gradient" : "text-muted"}`}>{i + 1}</span>
              <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-panel-2">
                {a.coverUrl && (
                  <img
                    src={coverVariants(a.coverUrl)?.small ?? a.coverUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                  />
                )}
                {a.hasVideo && <span className="absolute inset-0 flex items-center justify-center text-lg text-white/90">▶</span>}
                {a.coverDuration > 0 && (
                  <span className="absolute right-0.5 bottom-0.5 rounded bg-black/80 px-1 text-[10px] font-bold text-white">{formatDuration(a.coverDuration)}</span>
                )}
              </span>
              <span className="min-w-0">
                <span className="line-clamp-2 text-[13px] leading-snug font-semibold group-hover:text-brand">{a.title}</span>
                <span className="text-[11px] text-muted">{a.viewCount ? `👁 ${compactNumber(a.viewCount)}` : a.category?.name}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function Hero({ slides, top }: { slides: HeroSlide[]; top?: ArticleItem[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = slides.length;

  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || count < 2) return;
    const t = window.setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(t);
  }, [index, paused, count, go]);

  if (!count) return null;
  const showTop = !!top && top.length >= 3;

  return (
    <section className={`grid gap-4 ${showTop ? "lg:grid-cols-3" : ""}`}>
      <div
        className={`group relative aspect-[16/10] overflow-hidden rounded-2xl bg-panel-2 ring-1 ring-line sm:aspect-[16/8] ${showTop ? "lg:col-span-2 lg:aspect-auto lg:h-[420px]" : "lg:aspect-auto lg:h-[440px]"}`}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
        }}
      >
        {slides.map((s, i) => {
          const active = i === index;
          return (
            <Link
              key={s.key}
              to={s.to}
              aria-hidden={!active}
              tabIndex={active ? 0 : -1}
              className={`absolute inset-0 transition-opacity duration-700 ${active ? "z-10 opacity-100" : "pointer-events-none opacity-0"}`}
            >
              <img
                src={s.image}
                alt={s.title}
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : "auto"}
                decoding="async"
                className={`h-full w-full object-cover transition-transform duration-[6000ms] ease-out ${active ? "scale-110" : "scale-100"}`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-transparent" />
              <div
                className={`absolute inset-x-0 bottom-0 p-4 pb-9 transition sm:p-7 sm:pb-11 ${active ? "translate-y-0 opacity-100 delay-300 duration-500" : "translate-y-4 opacity-0 duration-0"}`}
              >
                <span className="badge bg-gradient-to-r from-brand to-brand-2 px-2 py-1 text-[11px] text-white">{s.label}</span>
                <h2 className="mt-2 line-clamp-2 max-w-3xl text-xl leading-tight font-black text-white drop-shadow-lg sm:text-3xl lg:text-4xl">{s.title}</h2>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate-200 sm:text-sm">
                  {s.meta.map((m) => (
                    <span key={m}>{m}</span>
                  ))}
                </div>
                <span className="btn-primary mt-3 hidden px-5 sm:inline-flex">{s.cta}</span>
              </div>
            </Link>
          );
        })}

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Trước"
              onClick={() => go(index - 1)}
              className="absolute top-1/2 left-3 z-20 hidden h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/50 text-2xl text-white opacity-0 backdrop-blur transition group-hover:opacity-100 hover:bg-brand sm:flex"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Sau"
              onClick={() => go(index + 1)}
              className="absolute top-1/2 right-3 z-20 hidden h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/50 text-2xl text-white opacity-0 backdrop-blur transition group-hover:opacity-100 hover:bg-brand sm:flex"
            >
              ›
            </button>
            <div className="absolute right-0 bottom-3 left-0 z-20 flex justify-center gap-1.5">
              {slides.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  aria-label={`Banner ${i + 1}`}
                  onClick={() => go(i)}
                  className={`h-1.5 cursor-pointer rounded-full transition-all ${i === index ? "w-7 bg-gradient-to-r from-brand to-brand-2" : "w-1.5 bg-white/50 hover:bg-white"}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {showTop && <TopList title="🏆 Hay nhất tuần" articles={top!} />}
    </section>
  );
}
