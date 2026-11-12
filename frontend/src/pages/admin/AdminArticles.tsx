import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage, uploadWithProgress } from "../../api";
import { ErrorBox, Pagination, Spinner } from "../../components/ui";
import { formatDate, formatDuration, formatNumber } from "../../format";
import { useFetch } from "../../useFetch";
import type { ArticleCategory, ArticleItem } from "../../types";

const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov";
const IMAGE_ACCEPT = "image/*";

interface AdminMedia {
  id: number;
  fileKey: string;
  thumbKey: string | null;
  url: string;
  duration: number;
}

interface AdminArticle {
  id: number;
  title: string;
  description: string;
  categoryId: number | null;
  visibility: "public" | "members";
  isHot: boolean;
  coverType: string;
  coverImageKey: string | null;
  coverDuration: number;
  tags: string;
  images: { id: number; fileKey: string; url: string; thumbUrl: string }[];
  videos: AdminMedia[];
}

/** Khung hình lấy từ video để làm ảnh bìa. */
function captureFrame(video: HTMLVideoElement): Promise<Blob | null> {
  const scale = Math.min(1, 1280 / (video.videoWidth || 1280));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((video.videoWidth || 1280) * scale);
  canvas.height = Math.round((video.videoHeight || 720) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85));
}

function UploadForm({ categories, onDone }: { categories: ArticleCategory[]; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tags, setTags] = useState("");
  const [membersOnly, setMembersOnly] = useState(false);
  const [isHot, setIsHot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ article: { id: number } }>("/api/admin/articles", {
        body: { title, description, categoryId: categoryId ? Number(categoryId) : null, tags, visibility: membersOnly ? "members" : "public", isHot },
      });
      setDone(res.article.id);
      setTitle("");
      setDescription("");
      setTags("");
      setMembersOnly(false);
      setIsHot(false);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={create} className="panel space-y-4 p-4">
      <h2 className="font-bold">📝 Đăng bài viết mới</h2>
      {done && (
        <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Đã tạo bài viết.{" "}
          <Link to={`/bai-viet/${done}`} className="underline">
            Xem bài viết →
          </Link>
          . Bạn có thể thêm ảnh/video và chọn ảnh bìa ở danh sách bên dưới.
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="label">Tiêu đề</label>
          <input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} disabled={busy} required minLength={2} />
        </div>
        <div>
          <label className="label">Thể loại</label>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={busy}>
            <option value="">— Không chọn —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Mô tả</label>
        <textarea className="input" rows={3} maxLength={20000} value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="label">Thẻ (cách nhau bằng dấu phẩy, tối đa 15)</label>
          <input className="input" maxLength={1000} placeholder="ví dụ: hài hước, mèo, tổng hợp" value={tags} onChange={(e) => setTags(e.target.value)} disabled={busy} />
        </div>
        <div className="space-y-2 self-end pb-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={membersOnly} onChange={(e) => setMembersOnly(e.target.checked)} disabled={busy} />
            🔒 Chỉ thành viên đã đăng nhập được xem
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isHot} onChange={(e) => setIsHot(e.target.checked)} disabled={busy} />
            🔥 Đánh dấu HOT
          </label>
        </div>
      </div>
      <ErrorBox message={error} />
      <button className="btn-primary" disabled={busy || title.trim().length < 2}>
        {busy ? "Đang tạo..." : "Tạo bài viết"}
      </button>
    </form>
  );
}

/** Quản lý media của một bài viết: thêm ảnh, thêm video, chọn ảnh bìa. */
function ArticleMediaEditor({ articleId, onChanged }: { articleId: number; onChanged: () => void }) {
  const { data, error, loading, reload } = useFetch<{ article: AdminArticle }>(`/api/admin/articles/${articleId}`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoMeta, setVideoMeta] = useState({ duration: 0, width: 0, height: 0 });
  const [thumb, setThumb] = useState<Blob | null>(null);

  useEffect(() => () => void (videoSrc && URL.revokeObjectURL(videoSrc)), [videoSrc]);

  async function act(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await fn();
      if (success) setMsg(success);
      reload();
      onChanged();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadImages(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    await act(async () => {
      for (const f of list) {
        const form = new FormData();
        form.append("file", f);
        await api(`/api/admin/articles/${articleId}/images`, { form });
      }
    }, `Đã tải lên ${list.length} ảnh.`);
    if (imageRef.current) imageRef.current.value = "";
  }

  async function uploadVideo(file: File | null) {
    if (!file) return;
    setBusy(true);
    setErr(null);
    setProgress(0);
    const form = new FormData();
    form.append("duration", String(videoMeta.duration));
    form.append("width", String(videoMeta.width));
    form.append("height", String(videoMeta.height));
    if (thumb) form.append("thumb", thumb, "thumb.jpg");
    form.append("video", file, file.name);
    try {
      await uploadWithProgress(`/api/admin/articles/${articleId}/videos`, form, setProgress);
      setMsg("Đã tải lên video.");
      setVideoSrc(null);
      setThumb(null);
      reload();
      onChanged();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setProgress(null);
      if (videoRef.current) videoRef.current.value = "";
    }
  }

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox message={error} />;
  const article = data.article;

  return (
    <div className="space-y-4">
      <div className="panel space-y-3 p-4">
        <h3 className="text-lg font-bold">{article.title}</h3>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy} onClick={() => imageRef.current?.click()}>
            🖼️ Tải ảnh lên
          </button>
          <input ref={imageRef} type="file" accept={IMAGE_ACCEPT} multiple hidden onChange={(e) => uploadImages(e.target.files)} />
          <button className="btn-ghost" disabled={busy} onClick={() => videoRef.current?.click()}>
            🎬 Tải video lên
          </button>
          <input
            ref={videoRef}
            type="file"
            accept={VIDEO_ACCEPT}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f) {
                setVideoSrc(URL.createObjectURL(f));
                setVideoMeta({ duration: 0, width: 0, height: 0 });
                setThumb(null);
              }
            }}
          />
          <button className="btn-ghost" disabled={busy} onClick={() => act(() => api(`/api/admin/articles/${articleId}`, { method: "PATCH", body: { isHot: !article.isHot } }))}>
            {article.isHot ? "Bỏ HOT" : "Đánh dấu HOT"}
          </button>
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={() => act(() => api(`/api/admin/articles/${articleId}`, { method: "PATCH", body: { visibility: article.visibility === "public" ? "members" : "public" } }))}
          >
            {article.visibility === "public" ? "Chuyển: chỉ thành viên" : "Chuyển: công khai"}
          </button>
          <button
            className="btn-danger"
            disabled={busy}
            onClick={async () => {
              if (!confirm("Xoá bài viết và toàn bộ media?")) return;
              await act(() => api(`/api/admin/articles/${articleId}`, { method: "DELETE" }));
              onChanged();
            }}
          >
            Xoá bài viết
          </button>
        </div>
        <div className="text-sm text-muted">
          {article.images.length} ảnh · {article.videos.length} video · {article.visibility === "public" ? "Công khai" : "Chỉ thành viên"} {article.isHot && "· HOT"}
        </div>
        {msg && <div className="text-sm text-emerald-300">{msg}</div>}
        <ErrorBox message={err} />
      </div>

      {videoSrc && (
        <div className="panel space-y-3 p-4">
          <h4 className="font-bold">Video đang chọn</h4>
          <video
            ref={videoElRef}
            src={videoSrc}
            controls
            muted
            playsInline
            preload="metadata"
            className="aspect-video w-full rounded-lg bg-black"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              setVideoMeta({ duration: Number.isFinite(v.duration) ? v.duration : 0, width: v.videoWidth, height: v.videoHeight });
            }}
          />
          <div className="text-xs text-muted">
            {videoMeta.duration > 0 && `${formatDuration(videoMeta.duration)} · ${videoMeta.width}×${videoMeta.height}`}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost px-3 py-1 text-xs"
              onClick={async () => {
                const v = videoElRef.current;
                if (!v || !v.videoWidth) return;
                const blob = await captureFrame(v);
                setThumb(blob);
              }}
            >
              📸 Lấy khung hình làm ảnh bìa
            </button>
            <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={busy || progress !== null} onClick={() => uploadVideo(videoRef.current?.files?.[0] ?? null)}>
              {progress !== null ? `Đang tải ${Math.round(progress * 100)}%` : "Tải video lên"}
            </button>
            {thumb && <span className="text-xs text-emerald-300">Đã có ảnh bìa cho video</span>}
          </div>
          {progress !== null && (
            <div className="h-2 overflow-hidden rounded-full bg-panel-2">
              <div className="h-full bg-brand transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {article.images.map((img) => {
          const isCover = article.coverType === "image" && article.coverImageKey === img.fileKey;
          return (
            <div key={img.id} className={`panel overflow-hidden ${isCover ? "ring-2 ring-brand" : ""}`}>
              <img src={img.thumbUrl} alt="" className="aspect-square w-full object-cover" loading="lazy" />
              <div className="flex justify-between p-1.5 text-xs">
                <button
                  className="cursor-pointer text-brand disabled:opacity-40"
                  disabled={busy || isCover}
                  onClick={() => act(() => api(`/api/admin/articles/${articleId}/cover`, { body: { type: "image", imageId: img.id } }))}
                >
                  {isCover ? "Ảnh bìa" : "Đặt bìa"}
                </button>
                <button className="cursor-pointer text-red-400" disabled={busy} onClick={() => act(() => api(`/api/admin/articles/${articleId}/images/${img.id}`, { method: "DELETE" }))}>
                  Xoá
                </button>
              </div>
            </div>
          );
        })}
        {article.videos.map((v) => {
          const isCover = article.coverType === "video" && v.thumbKey === article.coverImageKey;
          return (
            <div key={v.id} className={`panel overflow-hidden ${isCover ? "ring-2 ring-brand" : ""}`}>
              {v.thumbKey ? (
                <img src={`/media/t/${v.thumbKey}.webp`} alt="" className="aspect-square w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex aspect-square items-center justify-center bg-panel-2 text-3xl">🎬</div>
              )}
              <div className="p-1.5 text-xs">
                <div className="mb-1 text-muted">{v.duration > 0 ? formatDuration(v.duration) : "—"}</div>
                <div className="flex justify-between">
                  <button
                    className="cursor-pointer text-brand disabled:opacity-40"
                    disabled={busy || isCover}
                    onClick={() => act(() => api(`/api/admin/articles/${articleId}/cover`, { body: { type: "video", videoId: v.id } }))}
                  >
                    {isCover ? "Bìa" : "Đặt bìa"}
                  </button>
                  <button className="cursor-pointer text-red-400" disabled={busy} onClick={() => act(() => api(`/api/admin/articles/${articleId}/videos/${v.id}`, { method: "DELETE" }))}>
                    Xoá
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminArticles() {
  const { data: catData } = useFetch<{ categories: ArticleCategory[] }>("/api/articles/categories");
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { data, error, loading } = useFetch<{ articles: ArticleItem[]; page: number; totalPages: number; total: number }>(
    `/api/articles?sort=new&page=${page}&q=${encodeURIComponent(search)}&_=${tick}`,
  );
  const categories = catData?.categories ?? [];

  async function act(path: string, opts: { method: string; body: unknown }) {
    setErr(null);
    try {
      await api(path, opts);
      setTick((t) => t + 1);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  if (editing !== null) {
    return (
      <ArticleMediaEditor
        articleId={editing}
        onChanged={() => {
          setTick((t) => t + 1);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <UploadForm categories={categories} onDone={() => setTick((t) => t + 1)} />
      <section className="panel">
        <div className="panel-head flex-wrap">
          <h2 className="font-bold">📝 Danh sách bài viết {data && <span className="text-muted">({formatNumber(data.total)})</span>}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSearch(q.trim());
            }}
            className="flex gap-2"
          >
            <input className="input w-48 py-1" placeholder="Tìm tiêu đề..." value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn-ghost px-3 py-1">Tìm</button>
          </form>
        </div>
        <ErrorBox message={err} />
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <ErrorBox message={error} />
        ) : !data?.articles.length ? (
          <div className="p-8 text-center text-sm text-muted">Chưa có bài viết nào.</div>
        ) : (
          <ul className="divide-y divide-line">
            {data.articles.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Link to={`/bai-viet/${a.id}`} className="relative block w-32 shrink-0 overflow-hidden rounded border border-line bg-panel-2">
                  {a.coverUrl ? <img src={a.coverUrl} alt="" className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center">📝</div>}
                  {a.hasVideo && <span className="absolute inset-0 flex items-center justify-center text-xl text-white/80">▶</span>}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/bai-viet/${a.id}`} className="line-clamp-2 font-semibold hover:text-brand">
                    {a.membersOnly && <span className="mr-1 text-xs text-sky-300">🔒</span>}
                    {a.title}
                  </Link>
                  <div className="mt-0.5 text-xs text-muted">
                    🖼️ {a.imageCount} · 🎬 {a.videoCount} · {formatNumber(a.viewCount)} xem · 👍 {a.likeCount} · 💬 {a.commentCount} · {formatDate(a.createdAt)}
                  </div>
                </div>
                <select
                  className="input w-auto py-1 text-xs"
                  value={a.category?.id ?? ""}
                  onChange={(e) => act(`/api/admin/articles/${a.id}`, { method: "PATCH", body: { categoryId: e.target.value ? Number(e.target.value) : null } })}
                >
                  <option value="">— Thể loại —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-1">
                  <button
                    className="btn-ghost px-2 py-1 text-xs"
                    onClick={() => {
                      const title = prompt("Tiêu đề mới:", a.title);
                      if (title && title.trim() !== a.title) void act(`/api/admin/articles/${a.id}`, { method: "PATCH", body: { title } });
                    }}
                  >
                    Sửa tên
                  </button>
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(a.id)}>
                    Media
                  </button>
                  <button
                    className="btn-ghost px-2 py-1 text-xs"
                    title={a.membersOnly ? "Đang chỉ thành viên — bấm để công khai" : "Đang công khai — bấm để chỉ thành viên xem"}
                    onClick={() => act(`/api/admin/articles/${a.id}`, { method: "PATCH", body: { visibility: a.membersOnly ? "public" : "members" } })}
                  >
                    {a.membersOnly ? "🔓 Công khai" : "🔒 Chỉ TV"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
      </section>
    </div>
  );
}
