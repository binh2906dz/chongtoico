import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, errorMessage } from "../api";
import { isStaff, useAuth } from "../auth";
import { AdBanner, ReportButton, ShareBar } from "../components/Extras";
import { Avatar, ErrorBox, Pagination, PostContent, SectionHeader, UserLink } from "../components/ui";
import { ArticleCard } from "../components/ArticleCard";
import { ArticleLinkButtons } from "../components/ArticleLinkButtons";
import { formatDate, formatNumber, timeAgo } from "../format";
import { useFetch } from "../useFetch";
import { rememberArticle } from "../articleHistory";
import type { ArticleComment, ArticleDetail, ArticleItem, ArticleMedia } from "../types";

interface ArticleData {
  article: ArticleDetail;
  myVote: number;
  saved: { favorite: boolean; later: boolean };
  related: ArticleItem[];
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

function VoteBar({ article, initialVote }: { article: ArticleDetail; initialVote: number }) {
  const { user } = useAuth();
  const [state, setState] = useState({ likeCount: article.likeCount, dislikeCount: article.dislikeCount, myVote: initialVote });
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
      const res = await api<{ likeCount: number; dislikeCount: number; myVote: number }>(`/api/articles/${article.id}/vote`, {
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

function SaveButtons({ articleId, initial }: { articleId: number; initial: { favorite: boolean; later: boolean } }) {
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
      const res = await api<{ saved: boolean }>(`/api/articles/${articleId}/save`, { body: { list } });
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
      {error && <div className="mt-1 text-xs text-red-400">{error === "login" ? <LoginHint text="Đăng nhập để lưu bài viết." /> : error}</div>}
    </div>
  );
}

function Lightbox({ images, index, onClose, onIndex }: { images: ArticleMedia[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const prev = useCallback(() => onIndex((index - 1 + images.length) % images.length), [index, images.length, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % images.length), [index, images.length, onIndex]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = "";
    };
  }, [onClose, prev, next]);
  const img = images[index];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95" onClick={onClose}>
      <img src={img.url} alt="" className="max-h-[92vh] max-w-[94vw] object-contain" onClick={(e) => e.stopPropagation()} />
      <button className="absolute top-4 right-4 cursor-pointer text-3xl text-white" onClick={onClose} aria-label="Đóng">
        ×
      </button>
      <button
        className="absolute top-1/2 left-2 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 px-4 py-3 text-2xl text-white hover:bg-white/20"
        onClick={(e) => {
          e.stopPropagation();
          prev();
        }}
      >
        ‹
      </button>
      <button
        className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 px-4 py-3 text-2xl text-white hover:bg-white/20"
        onClick={(e) => {
          e.stopPropagation();
          next();
        }}
      >
        ›
      </button>
      <div className="absolute bottom-4 text-sm text-white/80">
        {index + 1} / {images.length}
      </div>
    </div>
  );
}

/** Ảnh của bài viết: hiển thị dạng lưới, bấm vào để phóng to. */
function ImageGallery({ images }: { images: ArticleMedia[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const close = useCallback(() => setOpen(null), []);
  if (!images.length) return null;
  return (
    <>
      <div className="columns-2 gap-3 sm:columns-3">
        {images.map((img, i) => (
          <button key={img.id} onClick={() => setOpen(i)} className="mb-3 block w-full cursor-zoom-in overflow-hidden rounded-lg border border-line">
            <img src={img.thumbUrl ?? img.url} alt="" loading="lazy" style={{ aspectRatio: `${img.width}/${img.height}` }} className="w-full object-cover transition hover:opacity-90" />
          </button>
        ))}
      </div>
      {open !== null && <Lightbox images={images} index={open} onClose={close} onIndex={setOpen} />}
    </>
  );
}

function VideoGallery({ videos }: { videos: ArticleMedia[] }) {
  if (!videos.length) return null;
  return (
    <div className="space-y-4">
      {videos.map((v) => (
        <div key={v.id} className="overflow-hidden rounded-xl border border-line bg-black">
          <video
            src={v.url}
            poster={v.thumbUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            controlsList="nodownload"
            className="aspect-video w-full bg-black"
          />
        </div>
      ))}
    </div>
  );
}

function CommentVotes({ comment }: { comment: ArticleComment }) {
  const { user } = useAuth();
  const [state, setState] = useState({ likeCount: comment.likeCount, dislikeCount: comment.dislikeCount, myVote: comment.myVote });
  const mine = user?.id === comment.author.id;

  async function vote(value: 1 | -1) {
    if (!user || mine) return;
    try {
      const res = await api<typeof state>(`/api/articles/comments/${comment.id}/vote`, { body: { value: state.myVote === value ? 0 : value } });
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
  articleId,
  parentId,
  placeholder,
  onSent,
  autoFocus,
}: {
  articleId: number;
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
      await api(`/api/articles/${articleId}/comments`, { body: { content, parentId } });
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
  articleId,
  onChanged,
  isReply = false,
}: {
  c: ArticleComment;
  articleId: number;
  onChanged: () => void;
  isReply?: boolean;
}) {
  const { user } = useAuth();
  const [replying, setReplying] = useState(false);

  async function remove() {
    if (!confirm(c.replies.length ? "Xoá bình luận này và các trả lời?" : "Xoá bình luận này?")) return;
    try {
      await api(`/api/articles/comments/${c.id}`, { method: "DELETE" });
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
          {c.author.id !== user?.id && <ReportButton targetType="article_comment" targetId={c.id} label="Báo vi phạm" />}
          {(c.author.id === user?.id || isStaff(user)) && (
            <button onClick={remove} className="cursor-pointer text-red-400 hover:text-red-300">
              Xoá
            </button>
          )}
        </div>
        {replying && (
          <div className="mt-2">
            <CommentForm
              articleId={articleId}
              parentId={c.id}
              placeholder={`Trả lời ${c.author.displayName || c.author.username}...`}
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
              <CommentItem key={r.id} c={r} articleId={articleId} onChanged={onChanged} isReply />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function Comments({ articleId }: { articleId: number }) {
  const { user } = useAuth();
  const location = useLocation();
  const [page, setPage] = useState(1);
  const { data, error, reload } = useFetch<{ comments: ArticleComment[]; page: number; totalPages: number; total: number }>(
    `/api/articles/${articleId}/comments?page=${page}`,
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
              articleId={articleId}
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
            <CommentItem key={c.id} c={c} articleId={articleId} onChanged={reload} />
          ))}
        </ul>
        {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
      </div>
    </section>
  );
}

function Recommended({ articleId, initial }: { articleId: number; initial: ArticleItem[] }) {
  const [list, setList] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function shuffle() {
    setLoading(true);
    try {
      const res = await api<{ articles: ArticleItem[] }>(`/api/articles/random?limit=12&exclude=${articleId}`);
      setList(res.articles);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <SectionHeader
        title="Bài viết đề xuất"
        action={
          <button className="btn-ghost rounded-full px-2.5 py-1 text-xs" onClick={shuffle} disabled={loading}>
            🔀 {loading ? "Đang đổi..." : "Đổi bài khác"}
          </button>
        }
      />
      {loading ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 lg:grid-cols-1">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton aspect-video rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="panel p-6 text-center text-sm text-muted">Chưa có bài viết nào khác.</div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 lg:grid-cols-1">
          {list.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      )}
    </>
  );
}

export default function ArticlePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading } = useFetch<ArticleData>(`/api/articles/${id}`);

  useEffect(() => {
    if (data && !user && !data.article.locked) rememberArticle(data.article.id);
  }, [data, user]);

  if (loading && !data) {
    return (
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="skeleton aspect-video rounded-xl" />
          <div className="skeleton h-7 w-3/4" />
          <div className="skeleton h-4 w-1/3" />
        </div>
        <div className="space-y-3">
          <div className="skeleton h-6 w-40" />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton aspect-video rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  if (error || !data) return <ErrorBox message={error} />;
  const { article } = data;

  async function remove() {
    if (!confirm("Xoá vĩnh viễn bài viết này?")) return;
    try {
      await api(`/api/admin/articles/${article.id}`, { method: "DELETE" });
      navigate("/bai-viet");
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {article.locked ? (
          <div className="panel relative overflow-hidden p-10 text-center">
            {article.coverUrl && <img src={article.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20 blur-sm" />}
            <div className="relative">
              <div className="text-4xl">🔒</div>
              <div className="mt-2 font-bold">Bài viết này chỉ dành cho thành viên</div>
              <div className="mt-3 flex justify-center gap-2">
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
          <>
            {article.videos.length > 0 && <VideoGallery videos={article.videos} />}
            {article.images.length > 0 && <ImageGallery images={article.images} />}
            {article.videos.length === 0 && article.images.length === 0 && (
              <div className="panel p-10 text-center text-muted">Bài viết này chưa có hình ảnh hay video.</div>
            )}
          </>
        )}
        <AdBanner slot="video" />
        <div className="space-y-3">
          <h1 className="text-xl font-black break-words md:text-2xl">
            {article.membersOnly && <span className="mr-2 align-middle text-sm text-sky-300">🔒</span>}
            {article.title}
          </h1>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-sm text-muted">
              {formatNumber(article.viewCount)} lượt xem · {formatDate(article.createdAt)}
              {article.category && (
                <>
                  {" · "}
                  <Link to={`/bai-viet/the-loai/${article.category.slug}`} className="text-brand hover:underline">
                    {article.category.name}
                  </Link>
                </>
              )}
              {article.imageCount > 0 && ` · 🖼️ ${article.imageCount} ảnh`}
              {article.videoCount > 0 && ` · 🎬 ${article.videoCount} video`}
              {article.commentCount > 0 && ` · 💬 ${formatNumber(article.commentCount)} bình luận`}
            </div>
            <VoteBar key={article.id} article={article} initialVote={data.myVote} />
          </div>
          {article.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {article.tags.map((t) => (
                <Link
                  key={t.id}
                  to={`/bai-viet/tag/${t.slug}`}
                  className="rounded-full border border-line px-2.5 py-0.5 text-xs text-slate-300 hover:border-brand/50 hover:text-brand"
                >
                  #{t.name}
                </Link>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SaveButtons key={article.id} articleId={article.id} initial={data.saved} />
            <ReportButton targetType="article" targetId={article.id} className="btn-ghost px-3 py-1.5 text-sm hover:text-red-300" />
          </div>
          <ShareBar title={article.title} path={`/bai-viet/${article.id}`} />
          {user?.role === "admin" && (
            <div className="flex gap-2">
              <Link to="/quan-tri?tab=bai-viet" className="btn-ghost px-3 py-1">
                Quản lý bài viết
              </Link>
              <button className="btn-danger px-3 py-1" onClick={remove}>
                Xoá bài viết
              </button>
            </div>
          )}
          {article.description && (
            <div className="panel p-4">
              <PostContent content={article.description} />
            </div>
          )}
          {/* Nút "Xem ngay" + "Kênh VIP" — nằm ngay dưới nội dung bài viết. */}
          {(article.watchLink || article.vipLink) && (
            <div className="panel p-4">
              <ArticleLinkButtons watchLink={article.watchLink} vipLink={article.vipLink} />
            </div>
          )}
        </div>
        {article.locked ? (
          // Bài "chỉ thành viên": khách không được đọc bình luận (API trả 403) nên không gọi,
          // tránh hiện khung lỗi đỏ trên trang.
          <div className="panel p-6 text-center text-sm text-muted">
            💬 Bình luận chỉ hiện với thành viên đã đăng nhập.
          </div>
        ) : (
          <Comments key={article.id} articleId={article.id} />
        )}
      </div>

      <aside className="space-y-3">
        <AdBanner slot="sidebar" />
        <Recommended key={article.id} articleId={article.id} initial={data.related} />
      </aside>
    </div>
  );
}
