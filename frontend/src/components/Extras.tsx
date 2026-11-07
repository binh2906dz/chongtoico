import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api";
import { useSite } from "../site";
import type { AdSlot, ReportTarget } from "../types";
import { ErrorBox } from "./ui";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}>
      <div className="panel w-full max-w-md shadow-2xl shadow-black/60" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2 className="font-bold">{title}</h2>
          <button className="cursor-pointer text-lg text-muted hover:text-white" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

const REASONS: { id: string; label: string }[] = [
  { id: "copyright", label: "Vi phạm bản quyền" },
  { id: "inappropriate", label: "Nội dung không phù hợp / phản cảm" },
  { id: "spam", label: "Spam, quảng cáo, lừa đảo" },
  { id: "error", label: "Lỗi (không xem được, sai thông tin)" },
  { id: "other", label: "Lý do khác" },
];

export function ReportButton({
  targetType,
  targetId,
  className = "text-xs text-muted hover:text-red-300",
  label = "⚑ Báo vi phạm",
}: {
  targetType: Exclude<ReportTarget, "site">;
  targetId: number;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("inappropriate");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await api("/api/reports", { body: { targetType, targetId, reason, message } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button type="button" className={`cursor-pointer ${className}`} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <Modal title="Báo vi phạm" onClose={() => setOpen(false)}>
          {done ? (
            <div className="space-y-3 text-sm">
              <p className="text-emerald-300">Cảm ơn bạn! Ban quản trị sẽ xem xét báo cáo sớm nhất.</p>
              <button className="btn-primary px-4 py-1.5" onClick={() => setOpen(false)}>
                Đóng
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3 text-sm">
              <div className="space-y-1.5">
                {REASONS.map((r) => (
                  <label key={r.id} className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="reason" checked={reason === r.id} onChange={() => setReason(r.id)} />
                    {r.label}
                  </label>
                ))}
              </div>
              <textarea
                className="input"
                rows={3}
                maxLength={2000}
                placeholder={reason === "other" ? "Mô tả lý do (bắt buộc)" : "Mô tả thêm (không bắt buộc)"}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              {reason === "copyright" && (
                <p className="text-xs text-muted">
                  Chủ sở hữu bản quyền muốn gửi yêu cầu chính thức, vui lòng dùng{" "}
                  <Link to="/go-noi-dung" className="text-brand hover:underline">
                    trang yêu cầu gỡ nội dung
                  </Link>
                  .
                </p>
              )}
              <ErrorBox message={error} />
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-ghost px-4 py-1.5" onClick={() => setOpen(false)}>
                  Huỷ
                </button>
                <button className="btn-danger px-4 py-1.5" disabled={sending}>
                  {sending ? "Đang gửi..." : "Gửi báo cáo"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

export function ShareBar({ title, path }: { title: string; path: string }) {
  const url = `${window.location.origin}${path}`;
  const [copied, setCopied] = useState(false);
  const enc = encodeURIComponent(url);
  const links = [
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc}`, cls: "hover:text-[#4c8bf5]" },
    { label: "Zalo", href: `https://sp.zalo.me/share_inline?d=${encodeURIComponent(JSON.stringify({ url }))}`, cls: "hover:text-[#2f80ed]" },
    { label: "Telegram", href: `https://t.me/share/url?url=${enc}&text=${encodeURIComponent(title)}`, cls: "hover:text-[#29a9eb]" },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Sao chép liên kết:", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, url });
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Chia sẻ:</span>
      <button type="button" className="btn-ghost px-3 py-1" onClick={copy}>
        {copied ? "✓ Đã sao chép" : "🔗 Sao chép link"}
      </button>
      {links.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={`btn-ghost px-3 py-1 ${l.cls}`}>
          {l.label}
        </a>
      ))}
      {typeof navigator.share === "function" && (
        <button type="button" className="btn-ghost px-3 py-1" onClick={nativeShare}>
          Khác…
        </button>
      )}
    </div>
  );
}

export function AdBanner({ slot, className = "" }: { slot: AdSlot; className?: string }) {
  const ad = useSite().site.ads[slot];
  if (!ad) return null;
  const img = <img src={ad.imageUrl} alt={ad.alt || "Quảng cáo"} loading="lazy" className="mx-auto block max-h-40 w-auto max-w-full rounded-lg" />;
  return (
    <div className={`relative ${className}`}>
      {ad.link ? (
        <a href={ad.link} target="_blank" rel="sponsored noopener noreferrer">
          {img}
        </a>
      ) : (
        img
      )}
      <span className="absolute top-1 right-1 rounded bg-black/60 px-1 text-[10px] text-slate-300">QC</span>
    </div>
  );
}

const TONES = {
  info: "border-sky-500/40 bg-sky-500/10 text-sky-100",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
};

export function NoticeBar() {
  const notice = useSite().site.notice;
  const [hidden, setHidden] = useState<string | null>(() => sessionStorage.getItem("ctc_notice_hidden"));
  if (!notice || hidden === notice.text) return null;
  return (
    <div className={`border-b ${TONES[notice.tone]}`}>
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-2 text-sm">
        <span>📢</span>
        <div className="flex-1 whitespace-pre-wrap">
          {notice.text}
          {notice.link && (
            <>
              {" "}
              <a href={notice.link} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                Xem chi tiết
              </a>
            </>
          )}
        </div>
        <button
          className="cursor-pointer opacity-70 hover:opacity-100"
          aria-label="Ẩn thông báo"
          onClick={() => {
            sessionStorage.setItem("ctc_notice_hidden", notice.text);
            setHidden(notice.text);
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
