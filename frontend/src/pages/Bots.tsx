import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type BotItem } from "../api";
import { useAuth } from "../auth";

export default function Bots() {
  const { admin } = useAuth();
  const isOwner = admin?.role === "owner";
  const [bots, setBots] = useState<BotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setBots(await api<BotItem[]>("/bots"));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách bot");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addBot(e: FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError("");
    try {
      await api<BotItem>("/bots", { method: "POST", body: JSON.stringify({ token: token.trim() }) });
      setToken("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thêm bot thất bại");
    } finally {
      setAdding(false);
    }
  }

  async function toggle(bot: BotItem) {
    try {
      await api<BotItem>(`/bots/${bot.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !bot.is_active }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cập nhật thất bại");
    }
  }

  async function remove(bot: BotItem) {
    if (!confirm(`Xoá bot @${bot.username}? Dữ liệu người đăng ký của bot này cũng bị xoá.`)) return;
    try {
      await api<void>(`/bots/${bot.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xoá thất bại");
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Quản lý Bot</h1>

      {isOwner && (
        <form onSubmit={addBot} className="mb-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 md:flex-row">
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Dán token bot từ @BotFather"
            required
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-orange-500"
          />
          <button
            type="submit"
            disabled={adding}
            className="rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {adding ? "Đang kiểm tra…" : "Thêm bot"}
          </button>
        </form>
      )}

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2">Bot</th>
              <th className="px-4 py-2">Token</th>
              <th className="px-4 py-2">Trạng thái</th>
              <th className="px-4 py-2 text-right">Người đăng ký</th>
              {isOwner && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">Đang tải…</td>
              </tr>
            )}
            {!loading && bots.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">Chưa có bot nào.</td>
              </tr>
            )}
            {bots.map((bot) => (
              <tr key={bot.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium">{bot.name || bot.username}</div>
                  <div className="text-xs text-slate-500">@{bot.username}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{bot.token_hint}</td>
                <td className="px-4 py-3">
                  {!bot.is_active ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Đã tắt</span>
                  ) : bot.running ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Đang chạy</span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Lỗi token / webhook</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{bot.subscribers}</td>
                {isOwner && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggle(bot)}
                      className="mr-2 rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                    >
                      {bot.is_active ? "Tắt" : "Bật"}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(bot)}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                    >
                      Xoá
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
