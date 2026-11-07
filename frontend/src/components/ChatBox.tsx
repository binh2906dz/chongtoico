import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api";
import { isStaff, useAuth } from "../auth";
import { timeAgo } from "../format";
import { getSocket } from "../socket";
import type { Channel, ChatMessage } from "../types";
import { Avatar, RoleBadge, UserLink } from "./ui";

export default function ChatBox({ channel, height = 420 }: { channel: Channel; height?: number }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    api<{ messages: ChatMessage[] }>(`/api/chat/channels/${channel.id}/messages?limit=50`)
      .then((res) => {
        if (cancelled) return;
        setMessages(res.messages);
        setHasMore(res.messages.length === 50);
        stickRef.current = true;
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));

    const s = getSocket();
    const join = () => s.emit("chat:join", channel.id);
    join();
    s.on("connect", join);
    const onMessage = (m: ChatMessage) => {
      if (m.channelId !== channel.id) return;
      const el = listRef.current;
      stickRef.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    };
    const onDeleted = (d: { id: number; channelId: number }) => {
      if (d.channelId === channel.id) setMessages((prev) => prev.filter((m) => m.id !== d.id));
    };
    s.on("chat:message", onMessage);
    s.on("chat:deleted", onDeleted);
    return () => {
      cancelled = true;
      s.off("connect", join);
      s.off("chat:message", onMessage);
      s.off("chat:deleted", onDeleted);
    };
  }, [channel.id]);

  useEffect(() => {
    if (stickRef.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function loadOlder() {
    if (!messages.length) return;
    const el = listRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const res = await api<{ messages: ChatMessage[] }>(`/api/chat/channels/${channel.id}/messages?limit=50&before=${messages[0].id}`);
    stickRef.current = false;
    setHasMore(res.messages.length === 50);
    setMessages((prev) => [...res.messages, ...prev]);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await api<{ message: ChatMessage }>(`/api/chat/channels/${channel.id}/messages`, { body: { content: text } });
      stickRef.current = true;
      setMessages((prev) => (prev.some((x) => x.id === res.message.id) ? prev : [...prev, res.message]));
      setText("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Xoá tin nhắn này?")) return;
    try {
      await api(`/api/chat/messages/${id}`, { method: "DELETE" });
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const canPost = !!user && !user.isBanned && (!channel.staffOnly || isStaff(user));

  return (
    <div className="flex flex-col">
      <div ref={listRef} style={{ height }} className="scroll-thin space-y-3 overflow-y-auto px-4 py-3">
        {loading && <div className="py-6 text-center text-sm text-muted">Đang tải...</div>}
        {!loading && hasMore && messages.length > 0 && (
          <button onClick={loadOlder} className="mx-auto block cursor-pointer text-xs text-muted hover:text-white">
            Xem tin cũ hơn
          </button>
        )}
        {!loading && messages.length === 0 && <div className="py-6 text-center text-sm text-muted">Chưa có tin nhắn. Hãy là người mở màn!</div>}
        {messages.map((m) => (
          <div key={m.id} className="group flex gap-2.5">
            <Avatar user={m.author} size={32} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs">
                <UserLink user={m.author} />
                <RoleBadge role={m.author.role} />
                <span className="text-muted">{timeAgo(m.createdAt)}</span>
                {isStaff(user) && (
                  <button onClick={() => remove(m.id)} className="ml-auto hidden cursor-pointer text-red-400 group-hover:inline">
                    Xoá
                  </button>
                )}
              </div>
              <div className="text-sm break-words whitespace-pre-wrap text-slate-200">{m.content}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-line p-3">
        {error && <div className="mb-2 text-xs text-red-400">{error}</div>}
        {canPost ? (
          <form onSubmit={send} className="flex gap-2">
            <input className="input" placeholder={`Nhắn vào #${channel.name}...`} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
            <button className="btn-primary" disabled={sending || !text.trim()}>
              Gửi
            </button>
          </form>
        ) : !user ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
            <span>Bạn phải đăng nhập để chat.</span>
            <Link to="/dang-nhap" className="btn-primary px-3 py-1.5">
              Đăng nhập ngay
            </Link>
          </div>
        ) : (
          <div className="text-sm text-muted">{user.isBanned ? "Tài khoản đang bị khoá, không thể chat." : "Chỉ ban quản trị được nhắn trong kênh này."}</div>
        )}
      </div>
    </div>
  );
}
