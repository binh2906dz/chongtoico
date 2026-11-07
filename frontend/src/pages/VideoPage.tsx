import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, errorMessage } from "../api";
import { isStaff, useAuth } from "../auth";
import { Avatar, ErrorBox, Pagination, PostContent, Spinner, UserLink } from "../components/ui";
import { VideoCard } from "../components/VideoCard";
import { formatDate, formatNumber, timeAgo } from "../format";
import { useFetch } from "../useFetch";
import { rememberVideo } from "../videoHistory";
import type { VideoComment, VideoDetail, VideoItem } from "../types";

interface VideoData {
  video: VideoDetail;
  myVote: number;
  related: VideoItem[];
}

function VoteBar({ video, initialVote }: { video: VideoDetail; initialVote: number }) {
  const { user } = useAuth();
  const [state, setState] = useState({ likeCount: video.likeCount, dislikeCount: video.dislikeCount, myVote: initialVote });
  const [error, setError] = useState<string | null>(null);
  const total = state.likeCount + state.dislikeCount;
  const pct = total ? Math.round((state.likeCount * 100) / total) : null;

  async function vote(value: 1 | -1) {
    setError(null);
    if (!user) {
      setError("Đăng nhập để bình chọn.");
      return;
    }
    try {
      const res = await api<{ likeCount: number; dislikeCount: number; myVote: number }>(`/api/videos/${video.id}/vote`, {
        body: { value: state.myVote === value ? 0 : value },
      });
      setState(res);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="min-w-48">
      <div className="flex items-center gap-2">
        <button
          onClick={() => vote(1)}
          className={`btn px-3 py-1.5 ${state.myVote === 1 ? "bg-emerald-500/20 text-emerald-300" : "bg-panel-2 text-slate-300 hover:text-white"}`}
        >
          👍 {formatNumber(state.likeCount)}
        </button>
        <button
          onClick={() => vote(-1)}
          className={`btn px-3 py-1.5 ${state.myVote === -1 ? "bg-red-500/20 text-red-300" : "bg-panel-2 text-slate-300 hover:text-white"}`}
        >
          👎 {formatNumber(state.dislikeCount)}
        </button>
        {pct !== null && <span className="text-sm font-bold text-emerald-400">{pct}%</span>}
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-red-500/40">
        <div className="h-full bg-emerald-400" style={{ width: `${pct ?? 0}%` }} />
      </div>
      {error && (
        <div className="mt-1 text-xs text-red-400">
          {error}{" "}
          {!user && (
            <Link to="/dang-nhap" className="text-brand hover:underline">
              Đăng nhập
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Comments({ videoId }: { videoId: number }) {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const { data, error, reload } = useFetch<{ comments: VideoComment[]; page: number; totalPages: number; total: number }>(
    `/api/videos/${videoId}/comments?page=${page}`,
  );
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setSendError(null);
    try {
      await api(`/api/videos/${videoId}/comments`, { body: { content } });
      setContent("");
      if (page !== 1) setPage(1);
      else reload();
    } catch (err) {
      setSendError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function remove(c: VideoComment) {
    if (!confirm("Xoá bình luận này?")) return;
    try {
      await api(`/api/videos/comments/${c.id}`, { method: "DELETE" });
      reload();
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="font-bold">💬 Bình luận {data && <span className="text-muted">({formatNumber(data.total)})</span>}</h2>
      </div>
      <div className="space-y-4 p-4">
        {user ? (
          user.isBanned ? (
            <div className="text-sm text-muted">Tài khoản đang bị khoá, không thể bình luận.</div>
          ) : (
            <form onSubmit={send} className="flex gap-3">
              <Avatar user={user} size={36} />
              <div className="flex-1 space-y-2">
                <textarea
                  className="input"
                  rows={2}
                  maxLength={2000}
                  placeholder="Viết bình luận..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
                <ErrorBox message={sendError} />
                <button className="btn-primary px-4 py-1.5" disabled={sending || !content.trim()}>
                  {sending ? "Đang gửi..." : "Bình luận"}
                </button>
              </div>
            </form>
          )
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm text-muted">
            <span>Đăng nhập để bình luận.</span>
            <Link to="/dang-nhap" className="btn-primary px-3 py-1">
              Đăng nhập
            </Link>
          </div>
        )}
        <ErrorBox message={error} />
        {data && !data.comments.length && <div className="py-4 text-center text-sm text-muted">Chưa có bình luận nào. Hãy là người đầu tiên!</div>}
        <ul className="space-y-4">
          {data?.comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Avatar user={c.author} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <UserLink user={c.author} className="text-sm" />
                  <span className="text-muted">{timeAgo(c.createdAt)}</span>
                  {(c.author.id === user?.id || isStaff(user)) && (
                    <button onClick={() => remove(c)} className="ml-auto cursor-pointer text-red-400 hover:text-red-300">
                      Xoá
                    </button>
                  )}
                </div>
                <div className="mt-0.5 text-sm break-words whitespace-pre-wrap text-slate-200">{c.content}</div>
              </div>
            </li>
          ))}
        </ul>
        {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
      </div>
    </section>
  );
}

export default function VideoPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading } = useFetch<VideoData>(`/api/videos/${id}`);

  useEffect(() => {
    if (data && !user) rememberVideo(data.video.id);
  }, [data, user]);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox message={error} />;
  const { video } = data;

  async function remove() {
    if (!confirm("Xoá vĩnh viễn video này?")) return;
    try {
      await api(`/api/admin/videos/${video.id}`, { method: "DELETE" });
      navigate("/video");
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="overflow-hidden rounded-xl border border-line bg-black">
          <video
            key={video.id}
            src={video.videoUrl}
            poster={video.thumbUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            controlsList="nodownload"
            className="aspect-video w-full bg-black"
          />
        </div>
        <div className="space-y-3">
          <h1 className="text-xl font-black break-words md:text-2xl">{video.title}</h1>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-sm text-muted">
              {formatNumber(video.viewCount)} lượt xem · {formatDate(video.createdAt)}
              {video.category && (
                <>
                  {" · "}
                  <Link to={`/video/the-loai/${video.category.slug}`} className="text-brand hover:underline">
                    {video.category.name}
                  </Link>
                </>
              )}
            </div>
            <VoteBar key={video.id} video={video} initialVote={data.myVote} />
          </div>
          {user?.role === "admin" && (
            <div className="flex gap-2">
              <Link to="/quan-tri?tab=videos" className="btn-ghost px-3 py-1">
                Quản lý video
              </Link>
              <button className="btn-danger px-3 py-1" onClick={remove}>
                Xoá video
              </button>
            </div>
          )}
          {video.description && (
            <div className="panel p-4">
              <PostContent content={video.description} />
            </div>
          )}
        </div>
        <Comments key={video.id} videoId={video.id} />
      </div>

      <aside className="space-y-3">
        <h2 className="font-bold">Video liên quan</h2>
        {data.related.length === 0 ? (
          <div className="panel p-6 text-center text-sm text-muted">Chưa có video liên quan.</div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 lg:grid-cols-1">
            {data.related.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
