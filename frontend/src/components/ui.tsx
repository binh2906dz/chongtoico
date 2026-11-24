import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatNumber, timeAgo } from "../format";
import type { Author, ThreadItem } from "../types";

export function Avatar({ user, size = 36 }: { user: Pick<Author, "username" | "displayName" | "avatarUrl"> | null; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.42) };
  const label = user?.displayName || user?.username || "?";
  if (user?.avatarUrl) {
    return <img src={user.avatarUrl} alt={user.username} style={style} className="shrink-0 rounded-full object-cover" loading="lazy" />;
  }
  const letter = label.charAt(0).toUpperCase();
  const hue = [...label].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
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
      {user.displayName || user.username}
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

export function SectionHeader({ title, more, action }: { title: ReactNode; more?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-6 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-brand to-brand-2" />
      <h2 className="min-w-0 truncate text-lg font-black tracking-tight sm:text-xl">{title}</h2>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {action}
        {more && (
          <Link to={more} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-slate-300 transition hover:border-brand/60 hover:text-brand">
            Xem thêm ›
          </Link>
        )}
      </div>
    </div>
  );
}

const gridCols = (dense: boolean) => `grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 ${dense ? "" : "lg:grid-cols-4"}`;

export function VideoGridSkeleton({ count = 8, dense = false }: { count?: number; dense?: boolean }) {
  return (
    <div className={gridCols(dense)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="skeleton aspect-video rounded-xl" />
          <div className="skeleton mt-2.5 h-3.5 w-11/12" />
          <div className="skeleton mt-1.5 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function AlbumGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton aspect-[3/4] rounded-xl" />
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="panel divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="skeleton h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-3/4" />
            <div className="skeleton h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-7 w-64" />
      <VideoGridSkeleton count={8} />
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

const TOKEN_RE = /\[img:([a-f0-9]{32})\]|(https?:\/\/[^\s<>"'[\]]+)/g;
const TAG_RE = /\[(\/?)(b|i|u|s|quote|spoiler|code|url)(?:=([^\]\n]{1,200}))?\]/gi;
const MAX_DEPTH = 20;

type BBNode = string | { tag: string; arg?: string; children: BBNode[] };

export function parseBB(src: string): BBNode[] {
  const root = { tag: "root", children: [] as BBNode[] };
  const stack: { tag: string; arg?: string; children: BBNode[] }[] = [root];
  const re = new RegExp(TAG_RE.source, "gi");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const [raw, close, nameRaw, arg] = m;
    const name = nameRaw.toLowerCase();
    const top = stack[stack.length - 1];
    if (m.index > last) top.children.push(src.slice(last, m.index));
    last = m.index + raw.length;
    if (!close && name === "code") {
      const end = src.toLowerCase().indexOf("[/code]", last);
      top.children.push({ tag: "code", children: [end === -1 ? src.slice(last) : src.slice(last, end)] });
      last = end === -1 ? src.length : end + "[/code]".length;
      re.lastIndex = last;
      continue;
    }
    if (!close) {
      if (stack.length > MAX_DEPTH) {
        top.children.push(raw);
        continue;
      }
      const node = { tag: name, arg: arg?.trim(), children: [] as BBNode[] };
      top.children.push(node);
      stack.push(node);
      continue;
    }
    let idx = -1;
    for (let k = stack.length - 1; k > 0; k--) {
      if (stack[k].tag === name) {
        idx = k;
        break;
      }
    }
    if (idx === -1) top.children.push(raw);
    else stack.length = idx;
  }
  if (last < src.length) stack[stack.length - 1].children.push(src.slice(last));
  return root.children;
}

const plainText = (nodes: BBNode[]): string => nodes.map((n) => (typeof n === "string" ? n : plainText(n.children))).join("");
const SAFE_URL = /^https?:\/\/[^\s<>"']+$/i;

function trimBlock(nodes: BBNode[]): BBNode[] {
  const out = [...nodes];
  if (typeof out[0] === "string") out[0] = out[0].replace(/^\n/, "");
  const lastIdx = out.length - 1;
  if (typeof out[lastIdx] === "string") out[lastIdx] = (out[lastIdx] as string).replace(/\n$/, "");
  return out;
}

function renderInline(text: string, key: string, linkify = true): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (m[2] && !linkify) continue;
    if (idx > last) parts.push(text.slice(last, idx));
    if (m[1]) {
      parts.push(
        <img key={`${key}-${i++}`} src={`/media/p/${m[1]}.webp`} alt="" loading="lazy" className="my-2 block max-h-[600px] max-w-full rounded-lg border border-line" />,
      );
    } else if (m[2]) {
      parts.push(
        <a key={`${key}-${i++}`} href={m[2]} target="_blank" rel="noopener noreferrer nofollow ugc" className="break-all text-brand hover:underline">
          {m[2]}
        </a>,
      );
    }
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderNodes(nodes: BBNode[], key: string, linkify = true): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}.${i}`;
    if (typeof n === "string") return <Fragment key={k}>{renderInline(n, k, linkify)}</Fragment>;
    const kids = () => renderNodes(n.children, k, linkify);
    switch (n.tag) {
      case "b":
        return <strong key={k} className="font-bold text-white">{kids()}</strong>;
      case "i":
        return <em key={k}>{kids()}</em>;
      case "u":
        return <u key={k}>{kids()}</u>;
      case "s":
        return <s key={k}>{kids()}</s>;
      case "code":
        return (
          <pre key={k} className="scroll-thin my-2 overflow-x-auto rounded-lg border border-line bg-black/40 p-3 font-mono text-xs whitespace-pre text-emerald-200">
            <code>{plainText(n.children).replace(/^\n/, "").replace(/\n$/, "")}</code>
          </pre>
        );
      case "quote":
        return (
          <blockquote key={k} className="my-2 rounded-r-lg border-l-4 border-brand/60 bg-panel-2/60 px-3 py-2 text-sm text-slate-300">
            {n.arg && <div className="mb-1 text-xs font-semibold text-brand">{n.arg} đã viết:</div>}
            {renderNodes(trimBlock(n.children), k, linkify)}
          </blockquote>
        );
      case "spoiler":
        return (
          <details key={k} className="my-2 rounded-lg border border-line bg-panel-2/40">
            <summary className="cursor-pointer px-3 py-1.5 text-sm font-semibold text-amber-300 select-none">
              🙈 {n.arg || "Nội dung ẩn"} — bấm để xem
            </summary>
            <div className="border-t border-line px-3 py-2">{renderNodes(trimBlock(n.children), k, linkify)}</div>
          </details>
        );
      case "url": {
        const href = (n.arg ?? plainText(n.children)).trim();
        if (!SAFE_URL.test(href)) return <Fragment key={k}>{kids()}</Fragment>;
        return (
          <a key={k} href={href} target="_blank" rel="noopener noreferrer nofollow ugc" className="break-all text-brand hover:underline">
            {n.arg ? renderNodes(n.children, k, false) : href}
          </a>
        );
      }
      default:
        return <Fragment key={k}>{kids()}</Fragment>;
    }
  });
}

export function PostContent({ content }: { content: string }) {
  return <div className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-slate-200">{renderNodes(parseBB(content), "n")}</div>;
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
