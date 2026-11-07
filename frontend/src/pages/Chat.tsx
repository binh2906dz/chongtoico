import { useEffect, useState } from "react";
import ChatBox from "../components/ChatBox";
import { ErrorBox, Spinner } from "../components/ui";
import { useOnline } from "../socket";
import { useFetch } from "../useFetch";
import type { Channel } from "../types";

export default function Chat() {
  const { data, error, loading } = useFetch<{ channels: Channel[] }>("/api/chat/channels");
  const [active, setActive] = useState<Channel | null>(null);
  const online = useOnline();

  useEffect(() => {
    if (data && !active) setActive(data.channels.find((c) => c.slug === "chung") ?? data.channels[0] ?? null);
  }, [data, active]);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox message={error} />;

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <aside className="panel h-fit">
        <div className="panel-head">
          <h2 className="font-bold">Kênh chat</h2>
        </div>
        <div className="p-2 text-xs text-muted">
          Có <b className="text-slate-200">{online.members}</b> thành viên và <b className="text-slate-200">{online.total}</b> người đang ● online
        </div>
        <nav className="flex gap-1 overflow-x-auto p-2 md:flex-col">
          {data.channels.map((c) => (
            <button
              key={c.id}
              onClick={() => setActive(c)}
              className={`cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-semibold whitespace-nowrap ${
                active?.id === c.id ? "bg-panel-2 text-brand" : "text-slate-300 hover:bg-panel-2/60"
              }`}
            >
              # {c.name}
            </button>
          ))}
        </nav>
      </aside>
      <section className="panel min-w-0">
        {active && (
          <>
            <div className="panel-head">
              <div>
                <h1 className="font-bold"># {active.name}</h1>
                {active.description && <div className="text-xs text-muted">{active.description}</div>}
              </div>
            </div>
            <ChatBox key={active.id} channel={active} height={520} />
          </>
        )}
      </section>
    </div>
  );
}
