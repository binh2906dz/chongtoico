import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorBox, UserLink } from "../components/ui";
import { formatDate, formatNumber } from "../format";
import { useFetch } from "../useFetch";
import type { Album, AlbumImage } from "../types";

function Lightbox({ images, index, onClose, onIndex }: { images: AlbumImage[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
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

export default function AlbumView() {
  const { id } = useParams();
  const { data, error, loading } = useFetch<{ album: Album; images: AlbumImage[] }>(`/api/albums/${id}`);
  const [open, setOpen] = useState<number | null>(null);
  const close = useCallback(() => setOpen(null), []);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-4 w-48" />
        <div className="skeleton h-8 w-2/3" />
        <div className="columns-2 gap-3 sm:columns-3 lg:columns-4">
          {[260, 180, 220, 300, 200, 240, 170, 280].map((h, i) => (
            <div key={i} className="skeleton mb-3 w-full" style={{ height: h }} />
          ))}
        </div>
      </div>
    );
  }
  if (error || !data) return <ErrorBox message={error} />;
  const { album, images } = data;

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted">
        <Link to="/album" className="hover:text-white">
          Kho album
        </Link>{" "}
        › {album.title}
      </div>
      <div>
        <h1 className="text-2xl font-black">{album.title}</h1>
        <div className="mt-1 text-sm text-muted">
          <UserLink user={album.author} /> · {formatDate(album.createdAt)} · {album.imageCount} ảnh · {formatNumber(album.viewCount)} lượt xem
        </div>
        {album.description && <p className="mt-3 whitespace-pre-wrap text-slate-300">{album.description}</p>}
      </div>
      {album.locked ? (
        <div className="panel p-10 text-center">
          <div className="text-4xl">🔒</div>
          <p className="mt-2 text-muted">Album này chỉ dành cho thành viên.</p>
          <Link to="/dang-nhap" className="btn-primary mt-4">
            Đăng nhập để xem
          </Link>
        </div>
      ) : images.length === 0 ? (
        <div className="panel p-10 text-center text-muted">Album chưa có ảnh.</div>
      ) : (
        <div className="columns-2 gap-3 sm:columns-3 lg:columns-4">
          {images.map((img, i) => (
            <button key={img.id} onClick={() => setOpen(i)} className="mb-3 block w-full cursor-zoom-in overflow-hidden rounded-lg border border-line">
              <img src={img.thumbUrl} alt="" loading="lazy" style={{ aspectRatio: `${img.width}/${img.height}` }} className="w-full object-cover transition hover:opacity-90" />
            </button>
          ))}
        </div>
      )}
      {open !== null && <Lightbox images={images} index={open} onClose={close} onIndex={setOpen} />}
    </div>
  );
}
