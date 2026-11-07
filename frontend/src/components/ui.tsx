import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatNumber, timeAgo } from "../format";
import type { Author, ThreadItem } from "../types";

export function Avatar({ user, size = 36 }: { user: Pick<Author, "username" | "avatarUrl"> | null; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.42) };
  if (user?.avatarUrl) {
    return <img src={user.avatarUrl} alt={user.username} style={style} className="shrink-0 rounded-full object-cover" loading="lazy" />;
  }
  const letter = (user?.username || "?").charAt(0).toUpperCase();
  const hue = [...(user?.username || "?")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      style={{ ...style, background: `hsl(${hue} 55% 35%)` }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
    >
      {letter}
    </span>
  );
}

export function roleColor(role: string, banned = false) {
  if (banned) return "text-slate-500 line-through";
  if (role === "admin") return "text-red-400";
  if (role === "mod") return "text-emerald-400";
  return "text-sky-300";
}

export function UserLink({ user, className = "" }: { user: Author | null; className?: string }) {
  if (!user) return <span className="text-muted">Ẩn danh</span>;
  return (
    <Link to={`/thanh-vien/${user.username}`} className={`font-semibold hover:underline ${roleColor(user.role, user.isBanned)} ${className}`}>
      {user.username}
    </Link>
  );
}

export function RoleBadge({ role }: { role: string }) {
  if (role === "admin") return <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-400 uppercase">Admin</span>;
  if (role === "mod") return <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 uppercase">Mod</span>;
  return null;
}

export function Spinner({ label = "Đang tải..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-muted">{children}</div>;
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{message}</div>;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="scroll-thin flex gap-1 overflow-x-auto">
      {tabs.map((t) => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)} className={`tab ${value === t.id ? "tab-active" : ""}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) pages.push(p);
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 py-4">
      <button className="btn-ghost px-3 py-1" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        &lt;
      </button>
      {pages[0] > 1 && (
        <>
          <button className="btn-ghost px-3 py-1" onClick={() => onPage(1)}>
            1
          </button>
          {pages[0] > 2 && <span className="px-1 text-muted">…</span>}
        </>
      )}
      {pages.map((p) => (
        <button key={p} className={p === page ? "btn-primary px-3 py-1" : "btn-ghost px-3 py-1"} onClick={() => onPage(p)}>
          {p}
        </button>
      ))}
      {pages[pages.length - 1] < totalPages && (
        <>
          {pages[pages.length - 1] < totalPages - 1 && <span className="px-1 text-muted">…</span>}
          <button className="btn-ghost px-3 py-1" onClick={() => onPage(totalPages)}>
            {totalPages}
          </button>
        </>
      )}
      <button className="btn-ghost px-3 py-1" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        &gt;
      </button>
    </div>
  );
}

const TOKEN_RE = /\[img:([a-f0-9]{32})\]|(https?:\/\/[^\s<>"']+)/g;

export function PostContent({ content }: { content: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of content.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(content.slice(last, idx));
    if (m[1]) {
      parts.push(
        <img key={i++} src={`/media/p/${m[1]}.webp`} alt="" loading="lazy" className="my-2 block max-h-[600px] max-w-full rounded-lg border border-line" />,
      );
    } else if (m[2]) {
      parts.push(
        <a key={i++} href={m[2]} target="_blank" rel="noopener noreferrer nofollow ugc" className="break-all text-brand hover:underline">
          {m[2]}
        </a>,
      );
    }
    last = idx + m[0].length;
  }
  if (last < content.length) parts.push(content.slice(last));
  return <div className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-slate-200">{parts}</div>;
}

export function ThreadRows({ threads, empty = "Chưa có chủ đề nào.", showCategory = true }: { threads: ThreadItem[]; empty?: string; showCategory?: boolean }) {
  if (!threads.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-line">
      {threads.map((t) => (
        <li key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-panel-2/60">
          <Avatar user={t.author} size={38} />
          <div className="min-w-0 flex-1">
            <Link to={`/chu-de/${t.id}`} className="line-clamp-2 font-semibold text-slate-100 hover:text-brand">
              {t.isPinned && <span className="mr-1.5 rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand uppercase">Ghim</span>}
              {t.isLocked && <span className="mr-1.5 text-xs">🔒</span>}
              {t.title}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <UserLink user={t.author} className="text-xs" />
              <span>·</span>
              <span>{timeAgo(t.createdAt)}</span>
              {showCategory && (
                <>
                  <span>·</span>
                  <Link to={`/dien-dan/${t.category.slug}`} className="hover:text-white">
                    {t.category.title}
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="hidden w-24 shrink-0 text-right text-xs text-muted sm:block">
            <div>
              <span className="font-semibold text-slate-300">{formatNumber(t.replyCount)}</span> trả lời
            </div>
            <div>
              <span className="font-semibold text-slate-300">{formatNumber(t.viewCount)}</span> xem
            </div>
          </div>
          <div className="hidden w-36 shrink-0 text-right text-xs md:block">
            <div className="text-muted">{timeAgo(t.lastPostAt)}</div>
            {t.lastPoster && <UserLink user={t.lastPoster} className="text-xs" />}
          </div>
        </li>
      ))}
    </ul>
  );
}
