import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage, uploadWithProgress } from "../../api";
import { ErrorBox, Pagination, Spinner } from "../../components/ui";
import { formatBytes, formatDate, formatDuration, formatNumber } from "../../format";
import { useFetch } from "../../useFetch";
import type { VideoCategory, VideoItem } from "../../types";

const ACCEPT = "video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov";

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

function UploadForm({ categories, onDone }: { categories: VideoCategory[]; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [meta, setMeta] = useState({ duration: 0, width: 0, height: 0 });
  const [decodeError, setDecodeError] = useState(false);
  const [thumb, setThumb] = useState<Blob | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tags, setTags] = useState("");
  const [membersOnly, setMembersOnly] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const thumbFileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoCaptured = useRef(false);

  useEffect(() => () => void (src && URL.revokeObjectURL(src)), [src]);
  useEffect(() => () => void (thumbUrl && URL.revokeObjectURL(thumbUrl)), [thumbUrl]);

  function setThumbBlob(b: Blob | null) {
    setThumb(b);
    setThumbUrl(b ? URL.createObjectURL(b) : null);
  }

  function pick(f: File | null) {
    setError(null);
    setDone(null);
    setDecodeError(false);
    setThumbBlob(null);
    setMeta({ duration: 0, width: 0, height: 0 });
    autoCaptured.current = false;
    setFile(f);
    setSrc(f ? URL.createObjectURL(f) : null);
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 200));
  }

  async function grab() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setThumbBlob(await captureFrame(v));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setProgress(0);
    const form = new FormData();
    form.append("title", title);
    form.append("description", description);
    form.append("categoryId", categoryId);
    form.append("tags", tags);
    form.append("visibility", membersOnly ? "members" : "public");
    form.append("duration", String(meta.duration));
    form.append("width", String(meta.width));
    form.append("height", String(meta.height));
    if (thumb) form.append("thumb", thumb, "thumb.jpg");
    form.append("video", file, file.name);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await uploadWithProgress<{ video: { id: number } }>("/api/admin/videos", form, setProgress, ctrl.signal);
      setDone(res.video.id);
      setFile(null);
      setSrc(null);
      setThumbBlob(null);
      setTitle("");
      setDescription("");
      setTags("");
      setMembersOnly(false);
      if (fileRef.current) fileRef.current.value = "";
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProgress(null);
      abortRef.current = null;
    }
  }

  const uploading = progress !== null;

  return (
    <form onSubmit={submit} className="panel space-y-4 p-4">
      <h2 className="font-bold">⬆️ Đăng video mới</h2>
      {done && (
        <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Đã đăng video.{" "}
          <Link to={`/video/${done}`} className="underline">
            Xem video →
          </Link>
        </div>
      )}
      <div>
        <label className="label">File video (mp4, webm, mov — nên dùng mp4 H.264 để mọi trình duyệt đều phát được)</label>
        <input ref={fileRef} type="file" accept={ACCEPT} disabled={uploading} onChange={(e) => pick(e.target.files?.[0] ?? null)} className="text-sm" />
        {file && (
          <div className="mt-1 text-xs text-muted">
            {file.name} · {formatBytes(file.size)}
            {meta.duration > 0 && ` · ${formatDuration(meta.duration)} · ${meta.width}×${meta.height}`}
          </div>
        )}
      </div>

      {src && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <video
              ref={videoRef}
              src={src}
              controls
              muted
              playsInline
              preload="metadata"
              className="aspect-video w-full rounded-lg bg-black"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                setMeta({ duration: Number.isFinite(v.duration) ? v.duration : 0, width: v.videoWidth, height: v.videoHeight });
                if (!autoCaptured.current && v.duration > 0) v.currentTime = Math.min(v.duration * 0.2, 30);
              }}
              onSeeked={() => {
                if (!autoCaptured.current) {
                  autoCaptured.current = true;
                  void grab();
                }
              }}
              onError={() => setDecodeError(true)}
            />
            {decodeError && (
              <div className="mt-2 text-xs text-amber-300">
                Trình duyệt không đọc được video này (có thể do mã hoá HEVC/H.265). Vẫn đăng được, nhưng nhiều người xem sẽ không phát được — nên chuyển sang
                mp4 H.264.
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={grab} disabled={decodeError}>
                📸 Lấy khung hình hiện tại làm ảnh bìa
              </button>
              <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => thumbFileRef.current?.click()}>
                🖼️ Chọn ảnh bìa từ máy
              </button>
              <input
                ref={thumbFileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setThumbBlob(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          <div>
            <div className="label">Ảnh bìa</div>
            {thumbUrl ? (
              <img src={thumbUrl} alt="" className="aspect-video w-full rounded-lg border border-line object-cover" />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-line text-sm text-muted">
                Chưa có ảnh bìa
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="label">Tiêu đề</label>
          <input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} disabled={uploading} required minLength={2} />
        </div>
        <div>
          <label className="label">Thể loại</label>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={uploading}>
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
        <textarea className="input" rows={3} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} disabled={uploading} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="label">Thẻ (cách nhau bằng dấu phẩy, tối đa 15)</label>
          <input
            className="input"
            maxLength={1000}
            placeholder="ví dụ: hài hước, mèo, tổng hợp"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            disabled={uploading}
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={membersOnly} onChange={(e) => setMembersOnly(e.target.checked)} disabled={uploading} />
          🔒 Chỉ thành viên đã đăng nhập được xem
        </label>
      </div>
      {!decodeError && src && meta.duration === 0 && (
        <div className="text-xs text-muted">Chưa đọc được thời lượng — máy chủ sẽ tự lấy sau khi tải lên (nếu có ffmpeg).</div>
      )}

      <ErrorBox message={error} />
      {uploading && (
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-panel-2">
            <div className="h-full bg-brand transition-all" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </div>
          <div className="text-xs text-muted">
            {progress !== null && progress >= 1 ? "Đang xử lý trên máy chủ..." : `Đang tải lên ${Math.round((progress ?? 0) * 100)}%`}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={!file || uploading || title.trim().length < 2}>
          {uploading ? "Đang tải lên..." : "Đăng video"}
        </button>
        {uploading && (
          <button type="button" className="btn-ghost" onClick={() => abortRef.current?.abort()}>
            Huỷ
          </button>
        )}
      </div>
    </form>
  );
}

function VideoList({ categories, tick }: { categories: VideoCategory[]; tick: number }) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const { data, error, loading, reload } = useFetch<{ videos: VideoItem[]; page: number; totalPages: number; total: number }>(
    `/api/videos?sort=new&page=${page}&q=${encodeURIComponent(search)}&_=${tick}`,
  );
  const [err, setErr] = useState<string | null>(null);
  const thumbRef = useRef<HTMLInputElement>(null);
  const [thumbFor, setThumbFor] = useState<number | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  return (
    <section className="panel">
      <div className="panel-head flex-wrap">
        <h2 className="font-bold">🎬 Danh sách video {data && <span className="text-muted">({formatNumber(data.total)})</span>}</h2>
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
      <input
        ref={thumbRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f || thumbFor === null) return;
          const form = new FormData();
          form.append("file", f);
          void act(() => api(`/api/admin/videos/${thumbFor}/thumb`, { form }));
        }}
      />
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : !data?.videos.length ? (
        <div className="p-8 text-center text-sm text-muted">Chưa có video nào.</div>
      ) : (
        <ul className="divide-y divide-line">
          {data.videos.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Link to={`/video/${v.id}`} className="relative block w-32 shrink-0 overflow-hidden rounded border border-line bg-panel-2">
                {v.thumbUrl ? <img src={v.thumbUrl} alt="" className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center">🎬</div>}
                {v.duration > 0 && <span className="absolute right-1 bottom-1 rounded bg-black/80 px-1 text-[10px] text-white">{formatDuration(v.duration)}</span>}
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/video/${v.id}`} className="line-clamp-2 font-semibold hover:text-brand">
                  {v.membersOnly && <span className="mr-1 text-xs text-sky-300">🔒</span>}
                  {v.title}
                </Link>
                <div className="mt-0.5 text-xs text-muted">
                  {formatNumber(v.viewCount)} xem · 👍 {v.likeCount} · 👎 {v.dislikeCount} · 💬 {v.commentCount} · {formatDate(v.createdAt)}
                </div>
              </div>
              <select
                className="input w-auto py-1 text-xs"
                value={v.category?.id ?? ""}
                onChange={(e) => act(() => api(`/api/admin/videos/${v.id}`, { method: "PATCH", body: { categoryId: e.target.value ? Number(e.target.value) : null } }))}
              >
                <option value="">— Không thể loại —</option>
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
                    const title = prompt("Tiêu đề mới:", v.title);
                    if (title && title.trim() !== v.title) void act(() => api(`/api/admin/videos/${v.id}`, { method: "PATCH", body: { title } }));
                  }}
                >
                  Sửa tên
                </button>
                <button
                  className="btn-ghost px-2 py-1 text-xs"
                  onClick={async () => {
                    try {
                      const { video } = await api<{ video: { tags: string } }>(`/api/admin/videos/${v.id}`);
                      const next = prompt("Thẻ (cách nhau bằng dấu phẩy):", video.tags);
                      if (next !== null && next !== video.tags) await act(() => api(`/api/admin/videos/${v.id}`, { method: "PATCH", body: { tags: next } }));
                    } catch (e) {
                      setErr(errorMessage(e));
                    }
                  }}
                >
                  Thẻ
                </button>
                <button
                  className="btn-ghost px-2 py-1 text-xs"
                  title={v.membersOnly ? "Đang chỉ thành viên — bấm để công khai" : "Đang công khai — bấm để chỉ thành viên xem"}
                  onClick={() =>
                    act(() => api(`/api/admin/videos/${v.id}`, { method: "PATCH", body: { visibility: v.membersOnly ? "public" : "members" } }))
                  }
                >
                  {v.membersOnly ? "🔓 Công khai" : "🔒 Chỉ TV"}
                </button>
                <button
                  className="btn-ghost px-2 py-1 text-xs"
                  onClick={() => {
                    setThumbFor(v.id);
                    thumbRef.current?.click();
                  }}
                >
                  Đổi ảnh bìa
                </button>
                <button
                  className="btn-danger px-2 py-1 text-xs"
                  onClick={() => confirm(`Xoá vĩnh viễn video "${v.title}"?`) && act(() => api(`/api/admin/videos/${v.id}`, { method: "DELETE" }))}
                >
                  Xoá
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </section>
  );
}

export default function AdminVideos({ isAdmin }: { isAdmin: boolean }) {
  const { data } = useFetch<{ categories: VideoCategory[] }>("/api/videos/categories");
  const [tick, setTick] = useState(0);
  const categories = data?.categories ?? [];
  if (!isAdmin) return <div className="panel p-6 text-sm text-muted">Chỉ quản trị viên được đăng và quản lý video.</div>;
  return (
    <div className="space-y-4">
      <UploadForm categories={categories} onDone={() => setTick((t) => t + 1)} />
      <VideoList categories={categories} tick={tick} />
    </div>
  );
}
