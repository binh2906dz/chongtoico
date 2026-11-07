import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, errorMessage } from "../api";
import { isStaff, useAuth } from "../auth";
import Editor from "../components/Editor";
import { Avatar, ErrorBox, Pagination, PostContent, RoleBadge, Spinner, UserLink } from "../components/ui";
import { formatDate, formatNumber, roleLabel } from "../format";
import { usePage } from "../usePage";
import { useFetch } from "../useFetch";
import type { Post, ThreadItem } from "../types";

interface ThreadData {
  thread: ThreadItem;
  watching: boolean;
  posts: Post[];
  page: number;
  totalPages: number;
}

const stripQuotes = (s: string) => s.replace(/\[quote(?:=[^\]]*)?\][\s\S]*?\[\/quote\]\n?/gi, "");

function WatchButton({ threadId, initial }: { threadId: number; initial: boolean }) {
  const [watching, setWatching] = useState(initial);
  return (
    <button
      className={watching ? "btn-ghost px-3 py-1.5 text-brand" : "btn-ghost px-3 py-1.5"}
      title={watching ? "Bỏ theo dõi chủ đề" : "Theo dõi chủ đề để xem lại trong mục Đang theo dõi"}
      onClick={async () => {
        try {
          const res = await api<{ watching: boolean }>(`/api/forum/threads/${threadId}/watch`, { method: "POST" });
          setWatching(res.watching);
        } catch (err) {
          alert(errorMessage(err));
        }
      }}
    >
      {watching ? "🔔 Đang theo dõi" : "🔕 Theo dõi"}
    </button>
  );
}

function PostCard({ post, canModerate, onChanged, onReply }: { post: Post; canModerate: boolean; onChanged: () => void; onReply: (p: Post) => void }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.content);
  const [liked, setLiked] = useState(post.likedByMe);
  const [likes, setLikes] = useState(post.likeCount);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const isOwner = user?.id === post.author.id;

  async function like() {
    setError(null);
    try {
      const res = await api<{ liked: boolean; likeCount: number }>(`/api/forum/posts/${post.id}/like`, { method: "POST" });
      setLiked(res.liked);
      setLikes(res.likeCount);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function save() {
    try {
      await api(`/api/forum/posts/${post.id}`, { method: "PATCH", body: { content: draft } });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove() {
    if (!confirm(post.isFirst ? "Xoá bài đầu tiên sẽ xoá cả chủ đề. Tiếp tục?" : "Xoá bài viết này?")) return;
    try {
      const res = await api<{ threadDeleted: boolean }>(`/api/forum/posts/${post.id}`, { method: "DELETE" });
      if (res.threadDeleted) navigate("/dien-dan");
      else onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <article id={`p${post.id}`} className="panel flex flex-col md:flex-row">
      <aside className="flex items-center gap-3 border-b border-line p-4 md:w-44 md:shrink-0 md:flex-col md:border-r md:border-b-0 md:text-center">
        <Avatar user={post.author} size={64} />
        <div className="min-w-0">
          <UserLink user={post.author} className="block truncate" />
          <div className="mt-0.5 flex items-center gap-1 md:justify-center">
            <RoleBadge role={post.author.role} />
            <span className="text-xs text-muted">{roleLabel[post.author.role]}</span>
          </div>
          <div className="mt-1 text-xs text-muted">{formatNumber(post.author.postCount)} bài viết</div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="mb-3 flex items-center justify-between text-xs text-muted">
          <span>
            {formatDate(post.createdAt)}
            {post.editedAt && <span className="ml-2 italic">(đã sửa)</span>}
          </span>
          <a href={`#p${post.id}`} className="hover:text-white">
            #{post.id}
          </a>
        </div>
        {editing ? (
          <div className="space-y-2">
            <Editor value={draft} onChange={setDraft} rows={8} />
            <div className="flex gap-2">
              <button className="btn-primary" onClick={save}>
                Lưu
              </button>
              <button className="btn-ghost" onClick={() => setEditing(false)}>
                Huỷ
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1">
            <PostContent content={post.content} />
          </div>
        )}
        {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
          <button
            onClick={like}
            disabled={!user || isOwner}
            className={`btn px-3 py-1 ${liked ? "bg-red-500/15 text-red-400" : "text-muted hover:text-white"}`}
            title={isOwner ? "Không thể tự thích bài của mình" : "Thích"}
          >
            {liked ? "❤" : "♡"} {likes > 0 && likes}
          </button>
          {user && (
            <button onClick={() => onReply(post)} className="btn px-3 py-1 text-muted hover:text-white">
              ❝ Trích dẫn
            </button>
          )}
          <div className="ml-auto flex gap-2">
            {(isOwner || canModerate) && !editing && (
              <button onClick={() => setEditing(true)} className="btn px-3 py-1 text-muted hover:text-white">
                Sửa
              </button>
            )}
            {(isOwner || canModerate) && (
              <button onClick={remove} className="btn px-3 py-1 text-red-400 hover:text-red-300">
                Xoá
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function ThreadPage() {
  const { id } = useParams();
  const [page, setPage] = usePage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useFetch<ThreadData>(`/api/forum/threads/${id}?page=${page}`);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [scrollTo, setScrollTo] = useState<number | null>(null);

  useEffect(() => {
    if (scrollTo && data?.posts.some((p) => p.id === scrollTo)) {
      document.getElementById(`p${scrollTo}`)?.scrollIntoView({ behavior: "smooth" });
      setScrollTo(null);
    }
  }, [data, scrollTo]);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox message={error} />;
  const { thread } = data;
  const staff = isStaff(user);
  const canReply = !!user && !user.isBanned && (!thread.isLocked || staff);

  async function send(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setReplyError(null);
    try {
      const res = await api<{ post: { id: number }; page: number }>(`/api/forum/threads/${thread.id}/posts`, { body: { content: reply } });
      setReply("");
      setScrollTo(res.post.id);
      if (res.page !== page) setPage(res.page);
      else reload();
    } catch (err) {
      setReplyError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function moderate(patch: Record<string, boolean>) {
    try {
      await api(`/api/forum/threads/${thread.id}`, { method: "PATCH", body: patch });
      reload();
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  async function removeThread() {
    if (!confirm("Xoá toàn bộ chủ đề này?")) return;
    try {
      await api(`/api/forum/threads/${thread.id}`, { method: "DELETE" });
      navigate(`/dien-dan/${thread.category.slug}`);
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  function quote(p: Post) {
    const excerpt = stripQuotes(p.content).trim().slice(0, 1000);
    setReply((r) => `${r}${r ? "\n" : ""}[quote=${p.author.username}]${excerpt}[/quote]\n`);
    document.getElementById("reply-box")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted">
        <Link to="/dien-dan" className="hover:text-white">
          Diễn đàn
        </Link>{" "}
        ›{" "}
        <Link to={`/dien-dan/${thread.category.slug}`} className="hover:text-white">
          {thread.category.title}
        </Link>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black break-words">
            {thread.isPinned && <span className="mr-2 align-middle text-sm text-brand">📌</span>}
            {thread.isLocked && <span className="mr-2 align-middle text-sm">🔒</span>}
            {thread.title}
          </h1>
          <div className="mt-1 text-sm text-muted">
            <UserLink user={thread.author} /> · {formatDate(thread.createdAt)} · {formatNumber(thread.viewCount)} lượt xem ·{" "}
            {formatNumber(thread.replyCount)} trả lời
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {user && <WatchButton key={thread.id} threadId={thread.id} initial={data.watching} />}
          {staff && (
            <>
            <button className="btn-ghost px-3 py-1.5" onClick={() => moderate({ isPinned: !thread.isPinned })}>
              {thread.isPinned ? "Bỏ ghim" : "Ghim"}
            </button>
            <button className="btn-ghost px-3 py-1.5" onClick={() => moderate({ isLocked: !thread.isLocked })}>
              {thread.isLocked ? "Mở khoá" : "Khoá"}
            </button>
            <button className="btn-danger px-3 py-1.5" onClick={removeThread}>
              Xoá chủ đề
            </button>
            </>
          )}
        </div>
      </div>

      <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />
      <div className="space-y-4">
        {data.posts.map((p) => (
          <PostCard key={`${p.id}-${p.editedAt}`} post={p} canModerate={staff} onChanged={reload} onReply={quote} />
        ))}
      </div>
      <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />

      <section id="reply-box" className="panel p-4">
        {canReply ? (
          <form onSubmit={send} className="space-y-3">
            <h2 className="font-bold">Trả lời chủ đề</h2>
            <Editor value={reply} onChange={setReply} placeholder="Viết câu trả lời..." />
            <ErrorBox message={replyError} />
            <button className="btn-primary" disabled={sending || !reply.trim()}>
              {sending ? "Đang gửi..." : "Gửi trả lời"}
            </button>
          </form>
        ) : !user ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
            <span>Bạn cần đăng nhập để trả lời.</span>
            <Link to="/dang-nhap" className="btn-primary">
              Đăng nhập
            </Link>
          </div>
        ) : (
          <div className="text-sm text-muted">{user.isBanned ? "Tài khoản đang bị khoá." : "Chủ đề đã bị khoá, không thể trả lời."}</div>
        )}
      </section>
    </div>
  );
}
