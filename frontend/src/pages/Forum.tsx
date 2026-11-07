import { Link } from "react-router-dom";
import { ErrorBox, ListSkeleton, UserLink } from "../components/ui";
import { formatNumber, timeAgo } from "../format";
import { useFetch } from "../useFetch";
import type { Category } from "../types";

export default function Forum() {
  const { data, error, loading } = useFetch<{ categories: Category[] }>("/api/forum/categories");
  if (loading && !data) return <ListSkeleton rows={8} />;
  if (error || !data) return <ErrorBox message={error} />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Diễn đàn</h1>
        <Link to="/tao-chu-de" className="btn-primary">
          + Tạo chủ đề
        </Link>
      </div>
      <section className="panel divide-y divide-line">
        {data.categories.map((c) => (
          <div key={c.id} className="flex items-center gap-4 px-4 py-4 hover:bg-panel-2/60">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-panel-2 text-2xl">{c.icon}</span>
            <div className="min-w-0 flex-1">
              <Link to={`/dien-dan/${c.slug}`} className="text-base font-bold hover:text-brand">
                {c.title}
              </Link>
              {c.staffOnly && <span className="ml-2 text-xs text-muted">(chỉ BQT đăng)</span>}
              <div className="text-sm text-muted">{c.description}</div>
            </div>
            <div className="hidden w-28 shrink-0 text-right text-xs text-muted sm:block">
              <div>
                <b className="text-slate-300">{formatNumber(c.threadCount)}</b> chủ đề
              </div>
              <div>
                <b className="text-slate-300">{formatNumber(c.postCount)}</b> bài viết
              </div>
            </div>
            <div className="hidden w-56 shrink-0 text-xs md:block">
              {c.latestThread ? (
                <>
                  <Link to={`/chu-de/${c.latestThread.id}`} className="line-clamp-1 font-semibold text-slate-200 hover:text-brand">
                    {c.latestThread.title}
                  </Link>
                  <div className="text-muted">
                    {timeAgo(c.latestThread.lastPostAt)} · <UserLink user={c.latestThread.lastPoster} className="text-xs" />
                  </div>
                </>
              ) : (
                <span className="text-muted">Chưa có chủ đề</span>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
