import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../api";
import { ErrorBox, Spinner, Tabs, UserLink } from "../../components/ui";
import { timeAgo } from "../../format";
import { getSocket } from "../../socket";
import type { Author, SupportMessage } from "../../types";

interface ConvItem {
  id: number;
  status: "open" | "closed";
  guestName: string | null;
  unreadStaff: number;
  lastMessageAt: string;
  user: Author | null;
  lastContent: string | null;
  lastFromStaff: boolean | null;
}

function Conversation({ id, onChanged }: { id: number; onChanged: () => void }) {
  const [conv, setConv] = useState<(ConvItem & { user: Author | null }) | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ conversation: ConvItem; messages: SupportMessage[] }>(`/api/admin/support/${id}`)
      .then((res) => {
        setConv(res.conversation);
        setMessages(res.messages);
        onChanged();
      })
      .catch((e) => setErr(errorMessage(e)));
    const s = getSocket();
    const handler = (p: { conversationId: number; message: SupportMessage }) => {
      if (p.conversationId === id) setMessages((prev) => (prev.some((m) => m.id === p.message.id) ? prev : [...prev, p.message]));
    };
    s.on("support:message", handler);
    return () => {
      s.off("support:message", handler);
    };
  }, [id, onChanged]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const res = await api<{ message: SupportMessage }>(`/api/admin/support/${id}/messages`, { body: { content: text } });
      setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]));
      setText("");
    } catch (e2) {
      setErr(errorMessage(e2));
    }
  }

  async function toggle() {
    if (!conv) return;
    const status = conv.status === "open" ? "closed" : "open";
    await api(`/api/admin/support/${id}`, { method: "PATCH", body: { status } });
    setConv({ ...conv, status });
    onChanged();
  }

  if (!conv) return err ? <ErrorBox message={err} /> : <Spinner />;
  return (
    <div className="flex h-[560px] flex-col">
      <div className="panel-head">
        <div>
          <div className="font-bold">{conv.user ? <UserLink user={conv.user} /> : `Khách: ${conv.guestName || `#${conv.id}`}`}</div>
          <div className="text-xs text-muted">Hội thoại #{conv.id}</div>
        </div>
        <button className="btn-ghost px-3 py-1.5" onClick={toggle}>
          {conv.status === "open" ? "Đóng hội thoại" : "Mở lại"}
        </button>
      </div>
      <div ref={listRef} className="scroll-thin flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.fromStaff ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.fromStaff ? "bg-brand text-white" : "bg-panel-2"}`}>
              {m.fromStaff && <div className="text-[11px] font-bold">{m.staff?.displayName || m.staff?.username}</div>}
              {m.content}
              <div className={`mt-0.5 text-[10px] ${m.fromStaff ? "text-slate-800" : "text-muted"}`}>{timeAgo(m.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
        <input className="input" placeholder="Trả lời khách..." value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
        <button className="btn-primary" disabled={!text.trim()}>
          Gửi
        </button>
      </form>
      <ErrorBox message={err} />
    </div>
  );
}

export default function AdminSupport() {
  const [status, setStatus] = useState<"open" | "closed" | "all">("open");
  const [list, setList] = useState<ConvItem[] | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useRef(() => setTick((t) => t + 1)).current;

  useEffect(() => {
    api<{ conversations: ConvItem[] }>(`/api/admin/support?status=${status}`)
      .then((res) => setList(res.conversations))
      .catch(() => setList([]));
  }, [status, tick]);

  useEffect(() => {
    const s = getSocket();
    s.on("support:message", refresh);
    return () => {
      s.off("support:message", refresh);
    };
  }, [refresh]);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <section className="panel h-fit">
        <div className="p-3">
          <Tabs
            tabs={[
              { id: "open", label: "Đang mở" },
              { id: "closed", label: "Đã đóng" },
              { id: "all", label: "Tất cả" },
            ]}
            value={status}
            onChange={setStatus}
          />
        </div>
        {!list ? (
          <Spinner />
        ) : list.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted">Không có hội thoại.</div>
        ) : (
          <ul className="scroll-thin max-h-[520px] divide-y divide-line overflow-y-auto">
            {list.map((c) => (
              <li key={c.id}>
                <button onClick={() => setActive(c.id)} className={`block w-full cursor-pointer px-4 py-3 text-left hover:bg-panel-2 ${active === c.id ? "bg-panel-2" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{c.user ? c.user.displayName || c.user.username : `Khách: ${c.guestName || `#${c.id}`}`}</span>
                    {c.unreadStaff > 0 && <span className="rounded-full bg-red-600 px-2 text-xs text-white">{c.unreadStaff}</span>}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {c.lastFromStaff ? "Bạn: " : ""}
                    {c.lastContent}
                  </div>
                  <div className="text-[11px] text-muted">{timeAgo(c.lastMessageAt)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel">{active ? <Conversation key={active} id={active} onChanged={refresh} /> : <div className="p-10 text-center text-muted">Chọn một hội thoại.</div>}</section>
    </div>
  );
}
