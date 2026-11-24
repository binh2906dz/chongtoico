import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { timeAgo } from "../format";
import { getSocket } from "../socket";
import type { NotificationItem } from "../types";
import { Avatar } from "./ui";

export function notificationLink(n: NotificationItem) {
  switch (n.type) {
    case "reply":
    case "quote":
      return n.postId ? `/bai/${n.postId}` : n.threadId ? `/chu-de/${n.threadId}` : "/";
    case "new_thread":
      return n.threadId ? `/chu-de/${n.threadId}` : "/";
    case "comment_reply":
      return n.articleId ? `/bai-viet/${n.articleId}${n.commentId ? `#c${n.commentId}` : ""}` : "/";
    case "follow":
      return n.actor ? `/thanh-vien/${n.actor.username}` : "/";
  }
}

export function notificationText(n: NotificationItem) {
  const who = n.actor?.displayName || n.actor?.username || "Ai đó";
  const thread = n.threadTitle ? `"${n.threadTitle}"` : "một chủ đề";
  switch (n.type) {
    case "reply":
      return `${who} đã trả lời trong chủ đề ${thread}`;
    case "quote":
      return `${who} đã trích dẫn bạn trong ${thread}`;
    case "new_thread":
      return `${who} vừa đăng chủ đề mới ${thread}`;
    case "comment_reply":
      return `${who} đã trả lời bình luận của bạn${n.articleTitle ? ` ở bài viết "${n.articleTitle}"` : ""}`;
    case "follow":
      return `${who} đã bắt đầu theo dõi bạn`;
  }
}

export function NotificationRow({ n, onClick }: { n: NotificationItem; onClick?: () => void }) {
  return (
    <Link
      to={notificationLink(n)}
      onClick={onClick}
      className={`flex gap-3 px-4 py-2.5 text-sm hover:bg-panel-2 ${n.isRead ? "text-slate-400" : "bg-brand/5 text-slate-100"}`}
    >
      <Avatar user={n.actor} size={32} />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2">{notificationText(n)}</div>
        <div className="text-xs text-muted">{timeAgo(n.createdAt)}</div>
      </div>
      {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
    </Link>
  );
}

export default function NotificationBell() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    api<{ unread: number }>("/api/notifications/unread-count")
      .then((r) => setUnread(r.unread))
      .catch(() => {});
    const s = getSocket();
    const onNotify = (p: { unread: number }) => {
      setUnread(p.unread);
      setItems(null);
    };
    s.on("notification", onNotify);
    return () => {
      s.off("notification", onNotify);
    };
  }, [user]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) Chống Tối Cổ` : "Chống Tối Cổ";
  }, [unread]);

  if (!user) return null;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    try {
      const res = await api<{ notifications: NotificationItem[] }>("/api/notifications");
      setItems(res.notifications.slice(0, 10));
      if (res.notifications.some((n) => !n.isRead)) {
        await api("/api/notifications/read", { body: {} });
        setUnread(0);
      }
    } catch {
      setItems([]);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} className="relative cursor-pointer rounded-full p-1.5 text-xl hover:bg-panel-2" aria-label="Thông báo">
        🔔
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] leading-4 font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="panel absolute right-0 z-40 mt-2 w-80 overflow-hidden shadow-xl shadow-black/40">
          <div className="panel-head">
            <span className="font-bold">Thông báo</span>
          </div>
          <div className="scroll-thin max-h-96 divide-y divide-line overflow-y-auto">
            {items === null ? (
              <div className="px-4 py-6 text-center text-sm text-muted">Đang tải...</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted">Chưa có thông báo nào.</div>
            ) : (
              items.map((n) => <NotificationRow key={n.id} n={n} onClick={() => setOpen(false)} />)
            )}
          </div>
          <Link to="/thong-bao" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2 text-center text-sm text-brand hover:bg-panel-2">
            Xem tất cả
          </Link>
        </div>
      )}
    </div>
  );
}
