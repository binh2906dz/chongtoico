import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, errorMessage } from "../api";
import { useAuth } from "../auth";
import { timeAgo } from "../format";
import { getSocket, reconnectSocket } from "../socket";
import type { SupportMessage } from "../types";

interface ConvResponse {
  conversation: { id: number } | null;
  messages: SupportMessage[];
}

export default function SupportWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [convId, setConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [text, setText] = useState("");
  const [guestName, setGuestName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const convRef = useRef<number | null>(null);
  const openRef = useRef(false);

  useEffect(() => {
    convRef.current = convId;
  }, [convId]);
  useEffect(() => {
    openRef.current = open;
    if (open) setUnread(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    api<ConvResponse>("/api/support/conversation")
      .then((res) => {
        setConvId(res.conversation?.id ?? null);
        setMessages(res.messages);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [open, user?.id]);

  useEffect(() => {
    const s = getSocket();
    const handler = (p: { conversationId: number; message: SupportMessage }) => {
      if (convRef.current !== null && p.conversationId !== convRef.current) return;
      setMessages((prev) => (prev.some((m) => m.id === p.message.id) ? prev : [...prev, p.message]));
      if (p.message.fromStaff && !openRef.current) setUnread((n) => n + 1);
    };
    s.on("support:message", handler);
    return () => {
      s.off("support:message", handler);
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await api<{ conversationId: number; message: SupportMessage }>("/api/support/messages", {
        body: { content: text, guestName: guestName || undefined },
      });
      const isNew = convRef.current === null;
      setConvId(res.conversationId);
      convRef.current = res.conversationId;
      setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]));
      setText("");
      if (isNew) reconnectSocket();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="panel flex h-[480px] max-h-[75vh] w-[340px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between bg-gradient-to-r from-brand to-brand-2 px-4 py-3 text-white">
            <div>
              <div className="font-bold">CSKH Chống Tối Cổ</div>
              <div className="text-xs opacity-80">Bạn cần hỗ trợ gì? Chúng tôi trả lời sớm nhất.</div>
            </div>
            <button onClick={() => setOpen(false)} className="cursor-pointer text-xl font-bold" aria-label="Đóng">
              ×
            </button>
          </div>
          <div ref={listRef} className="scroll-thin flex-1 space-y-2 overflow-y-auto p-3">
            {messages.length === 0 && (
              <div className="rounded-lg bg-panel-2 p-3 text-sm text-slate-300">
                Xin chào 👋 Hãy để lại câu hỏi, đội ngũ hỗ trợ sẽ phản hồi ngay khi có thể.
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.fromStaff ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.fromStaff ? "bg-panel-2 text-slate-100" : "bg-brand text-white"
                  }`}
                >
                  {m.fromStaff && <div className="mb-0.5 text-[11px] font-bold text-brand">{m.staff?.displayName || m.staff?.username || "Hỗ trợ"}</div>}
                  {m.content}
                  <div className={`mt-0.5 text-[10px] ${m.fromStaff ? "text-muted" : "text-slate-800"}`}>{timeAgo(m.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={send} className="space-y-2 border-t border-line p-3">
            {error && <div className="text-xs text-red-400">{error}</div>}
            {!user && convId === null && (
              <input className="input" placeholder="Tên của bạn (không bắt buộc)" value={guestName} maxLength={60} onChange={(e) => setGuestName(e.target.value)} />
            )}
            <div className="flex gap-2">
              <input className="input" placeholder="Nhập tin nhắn..." value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
              <button className="btn-primary px-3" disabled={sending || !text.trim()}>
                Gửi
              </button>
            </div>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex cursor-pointer items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-2 px-4 py-3 font-bold text-white shadow-lg shadow-brand/30 hover:brightness-110"
      >
        <span>💬</span>
        <span className="hidden sm:inline">CSKH</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs text-white">{unread}</span>
        )}
      </button>
    </div>
  );
}
