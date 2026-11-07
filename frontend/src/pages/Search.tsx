import { Link, useSearchParams } from "react-router-dom";
import { ErrorBox, Spinner, ThreadRows, VideoGridSkeleton } from "../components/ui";
import { VideoGrid } from "../components/VideoCard";
import { useFetch } from "../useFetch";
import type { ThreadItem, VideoItem } from "../types";

export default function Search() {
  const [params] = useSearchParams();
  const q = (params.get("q") || "").trim();
  const ok = q.length >= 2;
  const threads = useFetch<{ threads: ThreadItem[] }>(ok ? `/api/forum/search?q=${encodeURIComponent(q)}` : null);
  const videos = useFetch<{ videos: VideoItem[]; total: number }>(ok ? `/api/videos?q=${encodeURIComponent(q)}` : null);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">
        Kết quả tìm kiếm: <span className="text-gradient">{q}</span>
      </h1>
      {!ok ? (
        <ErrorBox message="Nhập ít nhất 2 ký tự để tìm." />
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 className="text-lg font-black">🎬 Video {videos.data && <span className="text-sm font-normal text-muted">({videos.data.total})</span>}</h2>
              {videos.data && videos.data.total > videos.data.videos.length && (
                <Link to={`/video?q=${encodeURIComponent(q)}`} className="text-sm text-brand hover:underline">
                  Xem tất cả →
                </Link>
              )}
            </div>
            {videos.loading ? <VideoGridSkeleton /> : videos.error ? <ErrorBox message={videos.error} /> : <VideoGrid videos={videos.data?.videos ?? []} empty="Không tìm thấy video nào." />}
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2 className="font-bold">💬 Chủ đề</h2>
            </div>
            {threads.loading ? (
              <Spinner />
            ) : threads.error ? (
              <ErrorBox message={threads.error} />
            ) : (
              <ThreadRows threads={threads.data?.threads ?? []} empty="Không tìm thấy chủ đề nào." />
            )}
          </section>
        </>
      )}
    </div>
  );
}
