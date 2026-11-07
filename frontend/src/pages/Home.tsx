import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import ChatBox from "../components/ChatBox";
import { RankingsPanel, StatsPanel } from "../components/Sidebar";
import { ErrorBox, Spinner, Tabs, ThreadRows } from "../components/ui";
import { useFetch } from "../useFetch";
import type { Album, Channel, Rankings, Stats, ThreadItem } from "../types";

interface HomeData {
  hotAlbums: Album[];
  feeds: { latest: ThreadItem[]; hot: ThreadItem[]; trending: ThreadItem[] };
  rankings: Rankings;
  stats: Stats;
}

type FeedTab = "latest" | "hot" | "trending";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function HotAlbumsBanner({ albums }: { albums: Album[] }) {
  const covers = albums.filter((a) => a.coverUrl).slice(0, 4);
  return (
    <Link to="/album" className="panel group relative block overflow-hidden">
      <div className="absolute inset-0 grid grid-cols-4 opacity-40 transition group-hover:opacity-55">
        {covers.map((a) => (
          <img key={a.id} src={a.coverUrl!} alt="" className="h-full w-full object-cover" />
        ))}
      </div>
      <div className="relative bg-gradient-to-r from-bg via-bg/85 to-transparent p-6 md:p-8">
        <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-black tracking-wider text-white uppercase">Hot albums</span>
        <h1 className="mt-3 text-2xl font-black md:text-3xl">
          <span className="text-gradient">ALBUM NỔI BẬT TUẦN NÀY</span>
        </h1>
        <p className="mt-1 text-sm text-slate-300">Tuyển tập bộ ảnh được xem nhiều nhất. Bấm để vào kho album!</p>
        <span className="btn-primary mt-4">Vào kho album →</span>
      </div>
    </Link>
  );
}

function AppCard() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  return (
    <div className="panel flex items-center gap-4 p-4">
      <img src="/favicon.svg" alt="" className="h-12 w-12" />
      <div className="min-w-0 flex-1">
        <div className="font-bold">Ứng dụng Chống Tối Cổ</div>
        <div className="text-xs text-muted">Xem album, diễn đàn, chat — cả cộng đồng trong tay bạn.</div>
      </div>
      {prompt ? (
        <button className="btn-primary" onClick={() => prompt.prompt()}>
          Cài đặt
        </button>
      ) : (
        <span className="rounded-lg border border-line px-3 py-2 text-xs text-muted">App Android sắp ra mắt</span>
      )}
    </div>
  );
}

export default function Home() {
  const { data, error, loading } = useFetch<HomeData>("/api/home");
  const [tab, setTab] = useState<FeedTab>("latest");
  const [channel, setChannel] = useState<Channel | null>(null);

  useEffect(() => {
    api<{ channels: Channel[] }>("/api/chat/channels")
      .then((res) => setChannel(res.channels.find((c) => c.slug === "chung") ?? res.channels[0] ?? null))
      .catch(() => {});
  }, []);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox message={error || "Không tải được dữ liệu."} />;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <HotAlbumsBanner albums={data.hotAlbums} />
        </div>
        <div className="flex flex-col gap-5">
          <AppCard />
          <Link to="/tao-chu-de" className="panel flex items-center gap-3 p-4 hover:border-brand/50">
            <span className="text-3xl">✍️</span>
            <div>
              <div className="font-bold">Đăng chủ đề mới</div>
              <div className="text-xs text-muted">Chia sẻ, hỏi đáp, tán gẫu cùng mọi người.</div>
            </div>
          </Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="panel">
            <div className="panel-head flex-wrap">
              <h2 className="font-bold">🔥 Chủ đề</h2>
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
            <div className="border-t border-line px-4 py-2 text-right">
              <Link to="/moi" className="text-sm text-brand hover:underline">
                Xem tất cả →
              </Link>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="font-bold">💬 Diễn đàn Chat {channel && <span className="text-muted">#{channel.name}</span>}</h2>
              <Link to="/chat" className="text-sm text-brand hover:underline">
                Vào kênh chat →
              </Link>
            </div>
            {channel ? <ChatBox channel={channel} height={340} /> : <Spinner />}
          </section>
        </div>

        <div className="space-y-5">
          <RankingsPanel rankings={data.rankings} />
          <StatsPanel stats={data.stats} />
        </div>
      </div>
    </div>
  );
}
