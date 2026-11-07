import { useEffect, useState } from "react";
import { api, type Stats } from "../api";

function Card({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Stats>("/stats")
      .then(setStats)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Tổng quan</h1>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {stats ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card label="Bot đang chạy" value={`${stats.bots_running}/${stats.bots_total}`} hint={`${stats.bots_active} bot đang bật`} />
          <Card label="Người dùng" value={stats.users_total} hint="Tài khoản Telegram duy nhất" />
          <Card label="Lượt đăng ký" value={stats.subscriptions_active} hint="Người dùng × bot còn nhận tin" />
          <Card label="Đã chặn bot" value={stats.subscriptions_blocked} />
        </div>
      ) : (
        !error && <p className="text-slate-500">Đang tải…</p>
      )}
    </div>
  );
}
