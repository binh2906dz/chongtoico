import { useRef, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../api";
import { ErrorBox, Pagination, Spinner } from "../../components/ui";
import { useFetch } from "../../useFetch";
import type { Album, AlbumImage } from "../../types";

function AlbumEditor({ albumId, onBack }: { albumId: number; onBack: () => void }) {
  const { data, error, loading, reload } = useFetch<{ album: Album; images: AlbumImage[] }>(`/api/albums/${albumId}`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function act(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await fn();
      if (success) setMsg(success);
      reload();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    await act(async () => {
      for (let i = 0; i < list.length; i += 10) {
        const form = new FormData();
        for (const f of list.slice(i, i + 10)) form.append("file", f);
        setMsg(`Đang tải ảnh ${Math.min(i + 10, list.length)}/${list.length}...`);
        await api(`/api/albums/${albumId}/images`, { form });
      }
    }, `Đã tải lên ${list.length} ảnh.`);
    if (fileRef.current) fileRef.current.value = "";
  }

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox message={error} />;
  const { album, images } = data;

  return (
    <div className="space-y-4">
      <button className="btn-ghost" onClick={onBack}>
        ← Danh sách album
      </button>
      <div className="panel space-y-3 p-4">
        <h3 className="text-lg font-bold">{album.title}</h3>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            + Tải ảnh lên
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
          <button className="btn-ghost" disabled={busy} onClick={() => act(() => api(`/api/albums/${albumId}`, { method: "PATCH", body: { isHot: !album.isHot } }))}>
            {album.isHot ? "Bỏ HOT" : "Đánh dấu HOT"}
          </button>
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={() =>
              act(() =>
                api(`/api/albums/${albumId}`, {
                  method: "PATCH",
                  body: { visibility: album.visibility === "public" ? "members" : "public" },
                }),
              )
            }
          >
            {album.visibility === "public" ? "Chuyển: chỉ thành viên" : "Chuyển: công khai"}
          </button>
          <button
            className="btn-danger"
            disabled={busy}
            onClick={async () => {
              if (!confirm("Xoá album và toàn bộ ảnh?")) return;
              await act(() => api(`/api/albums/${albumId}`, { method: "DELETE" }));
              onBack();
            }}
          >
            Xoá album
          </button>
        </div>
        <div className="text-sm text-muted">
          {album.imageCount} ảnh · {album.visibility === "public" ? "Công khai" : "Chỉ thành viên"} {album.isHot && "· HOT"}
        </div>
        {msg && <div className="text-sm text-emerald-300">{msg}</div>}
        <ErrorBox message={err} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {images.map((img) => (
          <div key={img.id} className={`panel overflow-hidden ${album.coverImageId === img.id ? "ring-2 ring-brand" : ""}`}>
            <img src={img.thumbUrl} alt="" className="aspect-square w-full object-cover" loading="lazy" />
            <div className="flex justify-between p-1.5 text-xs">
              <button
                className="cursor-pointer text-brand disabled:opacity-40"
                disabled={busy || album.coverImageId === img.id}
                onClick={() => act(() => api(`/api/albums/${albumId}`, { method: "PATCH", body: { coverImageId: img.id } }))}
              >
                {album.coverImageId === img.id ? "Ảnh bìa" : "Đặt bìa"}
              </button>
              <button className="cursor-pointer text-red-400" disabled={busy} onClick={() => act(() => api(`/api/albums/${albumId}/images/${img.id}`, { method: "DELETE" }))}>
                Xoá
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminAlbums() {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<number | null>(null);
  const { data, error, loading, reload } = useFetch<{ albums: Album[]; page: number; totalPages: number }>(`/api/albums?page=${page}`);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "members">("public");
  const [isHot, setIsHot] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (editing !== null)
    return (
      <AlbumEditor
        albumId={editing}
        onBack={() => {
          setEditing(null);
          reload();
        }}
      />
    );

  async function create(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const res = await api<{ album: { id: number } }>("/api/albums", { body: { title, description, visibility, isHot } });
      setTitle("");
      setDescription("");
      setEditing(res.album.id);
    } catch (e2) {
      setErr(errorMessage(e2));
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="panel grid gap-3 p-4 md:grid-cols-2">
        <h3 className="font-bold md:col-span-2">Tạo album mới</h3>
        <input className="input" placeholder="Tên album" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
        <select className="input" value={visibility} onChange={(e) => setVisibility(e.target.value as "public" | "members")}>
          <option value="public">Công khai</option>
          <option value="members">Chỉ thành viên đăng nhập</option>
        </select>
        <textarea className="input md:col-span-2" rows={2} placeholder="Mô tả (không bắt buộc)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isHot} onChange={(e) => setIsHot(e.target.checked)} /> Hiện ở banner HOT trang chủ
        </label>
        <div className="md:text-right">
          <button className="btn-primary" disabled={title.trim().length < 2}>
            Tạo và tải ảnh
          </button>
        </div>
        <div className="md:col-span-2">
          <ErrorBox message={err} />
        </div>
      </form>

      <section className="panel">
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <ErrorBox message={error} />
        ) : (
          <ul className="divide-y divide-line">
            {data?.albums.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                {a.coverUrl ? <img src={a.coverUrl} alt="" className="h-12 w-12 rounded object-cover" /> : <div className="h-12 w-12 rounded bg-panel-2" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{a.title}</div>
                  <div className="text-xs text-muted">
                    {a.imageCount} ảnh · {a.viewCount} lượt xem · {a.visibility === "public" ? "Công khai" : "Thành viên"} {a.isHot && "· HOT"}
                  </div>
                </div>
                <button className="btn-ghost px-3 py-1.5" onClick={() => setEditing(a.id)}>
                  Quản lý
                </button>
              </li>
            ))}
            {data?.albums.length === 0 && <li className="p-6 text-center text-sm text-muted">Chưa có album.</li>}
          </ul>
        )}
      </section>
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}
