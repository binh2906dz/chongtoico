import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth, isAdmin } from "../auth";
import ChatBox from "../components/ChatBox";
import { AdBanner } from "../components/Extras";
import Hero, { buildHeroSlides } from "../components/Hero";
import { StatsPanel } from "../components/Sidebar";
import { ErrorBox, SectionHeader, Spinner, Tabs, ThreadRows, VideoGridSkeleton } from "../components/ui";
import { ArticleGrid } from "../components/ArticleCard";
import { useFetch } from "../useFetch";
import type { ArticleItem, Channel, Stats, ThreadItem } from "../types";

interface HomeData {
  articles: { today: ArticleItem[]; week: ArticleItem[]; newest: ArticleItem[]; random: ArticleItem[]; watching: ArticleItem[] };
  feeds: { latest: ThreadItem[]; hot: ThreadItem[]; trending: ThreadItem[] };
  stats: Stats;
}

type FeedTab = "latest" | "hot" | "trending";

function Section({ title, more, action, children }: { title: ReactNode; more?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <SectionHeader title={title} more={more} action={action} />
      {children}
    </section>
  );
}

function RandomSection({ initial }: { initial: ArticleItem[] }) {
  const [articles, setArticles] = useState(initial);
  const [loading, setLoading] = useState(false);
  async function shuffle() {
    setLoading(true);
    try {
      setArticles((await api<{ articles: ArticleItem[] }>("/api/articles/random?limit=8")).articles);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Section
      title="🎲 Có thể bạn chưa xem"
      action={
        <button className="btn-ghost rounded-full px-3 py-1 text-xs" onClick={shuffle} disabled={loading}>
          🔀 {loading ? "Đang đổi..." : "Đổi bài khác"}
        </button>
      }
    >
      {loading ? <VideoGridSkeleton count={articles.length || 8} /> : <ArticleGrid articles={articles} />}
    </Section>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-7">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="skeleton aspect-[16/10] rounded-2xl sm:aspect-[16/8] lg:col-span-2 lg:aspect-auto lg:h-[420px]" />
        <div className="skeleton hidden h-[420px] rounded-xl lg:block" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton h-9 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="skeleton h-6 w-56" />
      <VideoGridSkeleton count={8} />
    </div>
  );
}

function CommunityBlock({ data }: { data: HomeData }) {
  const [tab, setTab] = useState<FeedTab>("latest");
  const [channel, setChannel] = useState<Channel | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    api<{ channels: Channel[] }>("/api/chat/channels")
      .then((res) => setChannel(res.channels.find((c) => c.slug === "chung") ?? res.channels[0] ?? null))
      .catch(() => {});
  }, []);

  return (
    <section className="space-y-3">
      <SectionHeader title="💬 Cộng đồng" more="/dien-dan" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel lg:col-span-2">
          <div className="panel-head flex-wrap">
            <h3 className="font-bold">Chủ đề</h3>
            <Tabs
              tabs={[
                { id: "latest", label: "Mới ra lò" },
                { id: "hot", label: "Hot trong ngày" },
                { id: "trending", label: "Trending tuần" },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>
          <ThreadRows
            threads={data.feeds[tab]}
            empty={tab === "latest" ? "Chưa có chủ đề nào." : "Chưa có chủ đề nào sôi nổi trong khoảng thời gian này."}
          />
          <div className="flex items-center justify-between border-t border-line px-4 py-2">
            {isAdmin(user) ? (
              <Link to="/tao-chu-de" className="text-sm font-semibold text-slate-300 hover:text-brand">
                ✍️ Đăng chủ đề mới
              </Link>
            ) : (
              <span className="text-sm text-muted">Chỉ quản trị viên được đăng chủ đề.</span>
            )}
            <Link to="/moi" className="text-sm text-brand hover:underline">
              Xem tất cả →
            </Link>
          </div>
        </div>
        <div className="space-y-4">
          <div className="panel">
            <div className="panel-head">
              <h3 className="truncate font-bold">Chat {channel && <span className="text-muted">#{channel.name}</span>}</h3>
              <Link to="/chat" className="shrink-0 text-sm text-brand hover:underline">
                Mở rộng →
              </Link>
            </div>
            {channel ? <ChatBox channel={channel} height={260} /> : <Spinner />}
          </div>
          <StatsPanel stats={data.stats} />
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { data, error, loading } = useFetch<HomeData>("/api/home");

  if (loading && !data) return <HomeSkeleton />;
  if (error || !data) return <ErrorBox message={error || "Không tải được dữ liệu."} />;

  const noArticles = !data.articles.newest.length;
  // Banner trượt: ưu tiên bài xem nhiều hôm nay, nếu chưa có bìa thì lùi sang bài trong tuần rồi bài mới,
  // để trang chủ luôn có banner thay vì trống.
  const slides = buildHeroSlides(data.articles.today).length
    ? buildHeroSlides(data.articles.today)
    : buildHeroSlides(data.articles.week).length
      ? buildHeroSlides(data.articles.week)
      : buildHeroSlides(data.articles.newest);

  return (
    <div className="space-y-8">
      <Hero slides={slides} top={data.articles.week} />

      {isAdmin(user) && (
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/quan-tri?tab=bai-viet" className="btn-primary px-4 py-2 text-sm">
            📝 Đăng bài viết
          </Link>
          <Link to="/tao-chu-de" className="btn-ghost px-4 py-2 text-sm">
            ✍️ Đăng chủ đề
          </Link>
        </div>
      )}

      {noArticles ? (
        <div className="panel p-10 text-center">
          <div className="text-4xl">📝</div>
          <p className="mt-2 text-muted">Chưa có bài viết nào.</p>
          {user?.role === "admin" && (
            <Link to="/quan-tri?tab=bai-viet" className="btn-primary mt-4">
              Đăng bài viết đầu tiên
            </Link>
          )}
        </div>
      ) : (
        <Section title="🔥 Xem nhiều hôm nay" more="/bai-viet?sap-xep=hom-nay">
          <ArticleGrid articles={data.articles.today} showRecent />
        </Section>
      )}

      {!noArticles && (
        <>
          {data.articles.watching.length > 0 && (
            <Section
              title={
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand" /> Đang được xem
                </span>
              }
            >
              <ArticleGrid articles={data.articles.watching} />
            </Section>
          )}
          <AdBanner slot="home" />
          <Section title="🆕 Bài viết mới nhất" more="/bai-viet">
            <ArticleGrid articles={data.articles.newest} />
          </Section>
          <Section title="🏆 Hay nhất tuần" more="/bai-viet?sap-xep=tuan">
            <ArticleGrid articles={data.articles.week} />
          </Section>
          <RandomSection initial={data.articles.random} />
        </>
      )}

      <CommunityBlock data={data} />
    </div>
  );
}
