import { useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import { useAuth } from "../auth";
import { ErrorBox, Pagination, Spinner } from "../components/ui";
import { VideoGrid } from "../components/VideoCard";
import { forgetVideo, localHistory } from "../videoHistory";
import type { VideoItem } from "../types";

function MemberHistory() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ videos: VideoItem[]; page: number; totalPages: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api<{ videos: VideoItem[]; page: number; totalPages: number }>(`/api/videos/history?page=${page}`)
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [page, tick]);

  async function act(path: string) {
    try {
      await api(path, { method: "DELETE" });
      setTick((t) => t + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;
  return (
    <>
      {data.videos.length > 0 && (
        <button className="btn-ghost px-3 py-1" onClick={() => confirm("Xoá toàn bộ lịch sử xem?") && act("/api/videos/history")}>
          Xoá toàn bộ lịch sử
        </button>
      )}
      <VideoGrid videos={data.videos} empty="Bạn chưa xem video nào." onRemove={(v) => act(`/api/videos/history/${v.id}`)} />
      <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />
    </>
  );
}

function GuestHistory() {
  const [videos, setVideos] = useState<VideoItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ids = localHistory();
    if (!ids.length) {
      setVideos([]);
      return;
    }
    api<{ videos: VideoItem[] }>(`/api/videos/by-ids?ids=${ids.join(",")}`)
      .then((res) => setVideos(res.videos))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!videos) return <Spinner />;
  return (
    <>
      <p className="text-sm text-muted">Lịch sử được lưu trên trình duyệt này. Đăng nhập để lưu theo tài khoản.</p>
      {videos.length > 0 && (
        <button
          className="btn-ghost px-3 py-1"
          onClick={() => {
            forgetVideo();
            setVideos([]);
          }}
        >
          Xoá toàn bộ lịch sử
        </button>
      )}
      <VideoGrid
        videos={videos}
        empty="Bạn chưa xem video nào."
        onRemove={(v) => {
          forgetVideo(v.id);
          setVideos((list) => list?.filter((x) => x.id !== v.id) ?? null);
        }}
      />
    </>
  );
}

export default function VideoHistory() {
  const { user, loading } = useAuth();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Video đã xem</h1>
      {loading ? <Spinner /> : user ? <MemberHistory /> : <GuestHistory />}
    </div>
  );
}
