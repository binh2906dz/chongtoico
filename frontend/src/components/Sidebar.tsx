import { formatNumber } from "../format";
import { useOnline } from "../socket";
import type { Stats } from "../types";
import { UserLink } from "./ui";

export function StatsPanel({ stats }: { stats: Stats }) {
  const online = useOnline();
  const rows = [
    ["Chủ đề", formatNumber(stats.threads)],
    ["Bài viết", formatNumber(stats.posts)],
    ["Thành viên", formatNumber(stats.members)],
    ["Đang online", formatNumber(online.total || stats.online.total)],
  ];
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="font-bold">📊 Thống kê diễn đàn</h2>
      </div>
      <dl className="space-y-2 p-4 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-muted">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
        {stats.newestMember && (
          <div className="flex justify-between">
            <dt className="text-muted">Thành viên mới nhất</dt>
            <dd>
              <UserLink user={stats.newestMember} />
            </dd>
          </div>
        )}
      </dl>
      {online.usernames.length > 0 && (
        <div className="border-t border-line px-4 py-3 text-xs text-muted">
          <div className="mb-1 font-semibold text-slate-300">Thành viên đang online</div>
          {online.usernames.join(", ")}
        </div>
      )}
    </section>
  );
}
