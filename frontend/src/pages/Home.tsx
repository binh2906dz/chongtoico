import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import ChatBox from "../components/ChatBox";
import { StatsPanel } from "../components/Sidebar";
import { ErrorBox, Spinner, Tabs, ThreadRows } from "../components/ui";
import { VideoGrid } from "../components/VideoCard";
import { useFetch } from "../useFetch";
import { VideoCategoryBar } from "./Videos";
import type { Album, Channel, Stats, ThreadItem, VideoItem } from "../types";

interface HomeData {
  videos: { today: VideoItem[]; newest: VideoItem[] };
  hotAlbums: Album[];
  feeds: { latest: ThreadItem[]; hot: ThreadItem[]; trending: ThreadItem[] };
  stats: Stats;
}

type FeedTab = "latest" | "hot" | "trending";

function HotAlbumsBanner({ albums }: { albums: Album[] }) {
  const covers = albums.filter((a) => a.coverUrl).slice(0, 4);
  return (
    <Link to="/album" className="panel group relative block overflow-hidden">
      <div className="absolute inset-0 grid grid-cols-4 opacity-40 transition group-hover:opacity-55">
        {covers.map((a) => (
          <img key={a.id} src={a.coverUrl!} alt="" className="h-full w-full object-cover" />
        ))}
      </div>
      <div className="relative bg-gradient-to-r from-bg via-bg/85 to-transparent p-5">
        <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-black tracking-wider text-white uppercase">Hot albums</span>
        <h2 className="mt-2 text-xl font-black">
          <span className="text-gradient">ALBUM NỔI BẬT</span>
        </h2>
        <p className="mt-1 text-sm text-slate-300">Tuyển tập bộ ảnh được xem nhiều nhất.</p>
        <span className="btn-primary mt-3">Vào kho album →</span>
      </div>
    </Link>
  );
}

function VideoSection({ title, more, children }: { title: string; more: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
        <h2 className="text-lg font-black">{title}</h2>
        <Link to={more} className="text-sm text-brand hover:underline">
          Xem thêm →
        </Link>
      </div>
      {children}
    </section>
  );
}

export default function Home() {
  const { user } = useAuth();
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

  const noVideos = !data.videos.newest.length;

  return (
    <div className="space-y-6">
      <VideoCategoryBar />

      {noVideos ? (
        <div className="panel p-10 text-center">
          <div className="text-4xl">🎬</div>
          <p className="mt-2 text-muted">Chưa có video nào.</p>
          {user?.role === "admin" && (
            <Link to="/quan-tri?tab=videos" className="btn-primary mt-4">
              Đăng video đầu tiên
            </Link>
          )}
        </div>
      ) : (
        <>
          <VideoSection title="🔥 Xem nhiều hôm nay" more="/video?sap-xep=hom-nay">
            <VideoGrid videos={data.videos.today} />
          </VideoSection>
          <VideoSection title="🆕 Video mới nhất" more="/video">
            <VideoGrid videos={data.videos.newest} />
          </VideoSection>
        </>
      )}

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
          <HotAlbumsBanner albums={data.hotAlbums} />
          <Link to="/tao-chu-de" className="panel flex items-center gap-3 p-4 hover:border-brand/50">
            <span className="text-3xl">✍️</span>
            <div>
              <div className="font-bold">Đăng chủ đề mới</div>
              <div className="text-xs text-muted">Chia sẻ, hỏi đáp, tán gẫu cùng mọi người.</div>
            </div>
          </Link>
          <StatsPanel stats={data.stats} />
        </div>
      </div>
    </div>
  );
}
