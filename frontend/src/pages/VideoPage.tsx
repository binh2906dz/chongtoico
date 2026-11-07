import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, errorMessage } from "../api";
import { isStaff, useAuth } from "../auth";
import { AdBanner, ReportButton, ShareBar } from "../components/Extras";
import { Avatar, ErrorBox, Pagination, PostContent, Spinner, UserLink } from "../components/ui";
import { VideoCard } from "../components/VideoCard";
import { formatDate, formatNumber, timeAgo } from "../format";
import { useFetch } from "../useFetch";
import { rememberVideo } from "../videoHistory";
import type { VideoComment, VideoDetail, VideoItem } from "../types";

interface VideoData {
  video: VideoDetail;
  myVote: number;
  saved: { favorite: boolean; later: boolean };
  related: VideoItem[];
}

function LoginHint({ text }: { text: string }) {
  return (
    <span>
      {text}{" "}
      <Link to="/dang-nhap" className="text-brand hover:underline">
        Đăng nhập
      </Link>
    </span>
  );
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
      setError("login");
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
      {error && <div className="mt-1 text-xs text-red-400">{error === "login" ? <LoginHint text="Đăng nhập để bình chọn." /> : error}</div>}
    </div>
  );
}

function SaveButtons({ videoId, initial }: { videoId: number; initial: { favorite: boolean; later: boolean } }) {
  const { user } = useAuth();
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function toggle(list: "favorite" | "later") {
    setError(null);
    if (!user) {
      setError("login");
      return;
    }
    try {
      const res = await api<{ saved: boolean }>(`/api/videos/${videoId}/save`, { body: { list } });
      setSaved((s) => ({ ...s, [list]: res.saved }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const cls = (on: boolean) => `btn px-3 py-1.5 ${on ? "bg-brand/20 text-brand" : "bg-panel-2 text-slate-300 hover:text-white"}`;
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button className={cls(saved.favorite)} onClick={() => toggle("favorite")}>
          {saved.favorite ? "❤️ Đã thích" : "🤍 Yêu thích"}
        </button>
        <button className={cls(saved.later)} onClick={() => toggle("later")}>
          {saved.later ? "✓ Trong Xem sau" : "🕒 Xem sau"}
        </button>
      </div>
      {error && <div className="mt-1 text-xs text-red-400">{error === "login" ? <LoginHint text="Đăng nhập để lưu video." /> : error}</div>}
    </div>
  );
}

function CommentVotes({ comment }: { comment: VideoComment }) {
  const { user } = useAuth();
  const [state, setState] = useState({ likeCount: comment.likeCount, dislikeCount: comment.dislikeCount, myVote: comment.myVote });
  const mine = user?.id === comment.author.id;

  async function vote(value: 1 | -1) {
    if (!user || mine) return;
    try {
      const res = await api<typeof state>(`/api/videos/comments/${comment.id}/vote`, { body: { value: state.myVote === value ? 0 : value } });
      setState(res);
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  const btn = (on: boolean, color: string) =>
    `cursor-pointer disabled:cursor-default ${on ? color : "text-muted hover:text-white"} disabled:hover:text-muted`;
  return (
    <span className="flex items-center gap-2">
      <button className={btn(state.myVote === 1, "text-emerald-300")} disabled={!user || mine} onClick={() => vote(1)} title="Thích">
        👍 {state.likeCount || ""}
      </button>
      <button className={btn(state.myVote === -1, "text-red-300")} disabled={!user || mine} onClick={() => vote(-1)} title="Không thích">
        👎 {state.dislikeCount || ""}
      </button>
    </span>
  );
}

function CommentForm({
  videoId,
  parentId,
  placeholder,
  onSent,
  autoFocus,
}: {
  videoId: number;
  parentId?: number;
  placeholder: string;
  onSent: () => void;
  autoFocus?: boolean;
}) {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;

  async function send(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await api(`/api/videos/${videoId}/comments`, { body: { content, parentId } });
      setContent("");
      onSent();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} className="flex gap-3">
      <Avatar user={user} size={parentId ? 28 : 36} />
      <div className="flex-1 space-y-2">
        <textarea
          className="input"
          rows={parentId ? 1 : 2}
          maxLength={2000}
          placeholder={placeholder}
          value={content}
          autoFocus={autoFocus}
          onChange={(e) => setContent(e.target.value)}
        />
        <ErrorBox message={error} />
        <button className="btn-primary px-4 py-1.5" disabled={sending || !content.trim()}>
          {sending ? "Đang gửi..." : parentId ? "Trả lời" : "Bình luận"}
        </button>
      </div>
    </form>
  );
}

function CommentItem({
  c,
  videoId,
  onChanged,
  isReply = false,
}: {
  c: VideoComment;
  videoId: number;
  onChanged: () => void;
  isReply?: boolean;
}) {
  const { user } = useAuth();
  const [replying, setReplying] = useState(false);

  async function remove() {
    if (!confirm(c.replies.length ? "Xoá bình luận này và các trả lời?" : "Xoá bình luận này?")) return;
    try {
      await api(`/api/videos/comments/${c.id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  return (
    <li id={`c${c.id}`} className="flex scroll-mt-20 gap-3">
      <Avatar user={c.author} size={isReply ? 28 : 36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <UserLink user={c.author} className="text-sm" />
          <span className="text-muted">{timeAgo(c.createdAt)}</span>
        </div>
        <div className="mt-0.5 text-sm break-words whitespace-pre-wrap text-slate-200">{c.content}</div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
          <CommentVotes comment={c} />
          {user && !user.isBanned && (
            <button className="cursor-pointer text-muted hover:text-white" onClick={() => setReplying((r) => !r)}>
              Trả lời
            </button>
          )}
          {c.author.id !== user?.id && <ReportButton targetType="video_comment" targetId={c.id} label="Báo vi phạm" />}
          {(c.author.id === user?.id || isStaff(user)) && (
            <button onClick={remove} className="cursor-pointer text-red-400 hover:text-red-300">
              Xoá
            </button>
          )}
        </div>
        {replying && (
          <div className="mt-2">
            <CommentForm
              videoId={videoId}
              parentId={c.id}
              placeholder={`Trả lời ${c.author.username}...`}
              autoFocus
              onSent={() => {
                setReplying(false);
                onChanged();
              }}
            />
          </div>
        )}
        {c.replies.length > 0 && (
          <ul className="mt-3 space-y-3 border-l border-line pl-3">
            {c.replies.map((r) => (
              <CommentItem key={r.id} c={r} videoId={videoId} onChanged={onChanged} isReply />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function Comments({ videoId }: { videoId: number }) {
  const { user } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const { data, error, reload } = useFetch<{ comments: VideoComment[]; page: number; totalPages: number; total: number }>(
    `/api/videos/${videoId}/comments?page=${page}`,
  );

  useEffect(() => {
    if (!data || !location.hash.startsWith("#c")) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [data, location.hash]);

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
            <CommentForm
              videoId={videoId}
              placeholder="Viết bình luận..."
              onSent={() => {
                if (page !== 1) setPage(1);
                else reload();
              }}
            />
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
            <CommentItem key={c.id} c={c} videoId={videoId} onChanged={reload} />
          ))}
        </ul>
        {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
      </div>
    </section>
  );
}

function Recommended({ videoId, initial }: { videoId: number; initial: VideoItem[] }) {
  const [list, setList] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function shuffle() {
    setLoading(true);
    try {
      const res = await api<{ videos: VideoItem[] }>(`/api/videos/random?limit=12&exclude=${videoId}`);
      setList(res.videos);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Video đề xuất</h2>
        <button className="btn-ghost px-2.5 py-1 text-xs" onClick={shuffle} disabled={loading}>
          🔀 {loading ? "Đang đổi..." : "Đổi video khác"}
        </button>
      </div>
      {list.length === 0 ? (
        <div className="panel p-6 text-center text-sm text-muted">Chưa có video nào khác.</div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 lg:grid-cols-1">
          {list.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      )}
    </>
  );
}

export default function VideoPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading } = useFetch<VideoData>(`/api/videos/${id}`);

  useEffect(() => {
    if (data && !user && !data.video.locked) rememberVideo(data.video.id);
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
          {video.locked || !video.videoUrl ? (
            <div className="relative aspect-video w-full">
              {video.thumbUrl && <img src={video.thumbUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 blur-sm" />}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                <div className="text-4xl">🔒</div>
                <div className="font-bold">Video chỉ dành cho thành viên</div>
                <div className="flex gap-2">
                  <Link to="/dang-nhap" className="btn-primary px-4 py-1.5">
                    Đăng nhập
                  </Link>
                  <Link to="/dang-ky" className="btn-ghost px-4 py-1.5">
                    Đăng ký miễn phí
                  </Link>
                </div>
              </div>
            </div>
          ) : (
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
          )}
        </div>
        <AdBanner slot="video" />
        <div className="space-y-3">
          <h1 className="text-xl font-black break-words md:text-2xl">
            {video.membersOnly && <span className="mr-2 align-middle text-sm text-sky-300">🔒</span>}
            {video.title}
          </h1>
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
          {video.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {video.tags.map((t) => (
                <Link
                  key={t.id}
                  to={`/video/tag/${t.slug}`}
                  className="rounded-full border border-line px-2.5 py-0.5 text-xs text-slate-300 hover:border-brand/50 hover:text-brand"
                >
                  #{t.name}
                </Link>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SaveButtons key={video.id} videoId={video.id} initial={data.saved} />
            <ReportButton targetType="video" targetId={video.id} className="btn-ghost px-3 py-1.5 text-sm hover:text-red-300" />
          </div>
          <ShareBar title={video.title} path={`/video/${video.id}`} />
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
        <AdBanner slot="sidebar" />
        <Recommended key={video.id} videoId={video.id} initial={data.related} />
      </aside>
    </div>
  );
}
