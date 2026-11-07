import { useState } from "react";
import { formatNumber, timeAgo } from "../format";
import { useOnline } from "../socket";
import type { Rankings, Stats } from "../types";
import { Avatar, Empty, Tabs, UserLink } from "./ui";

type RankTab = "topLiked" | "topPosters" | "newest" | "banned";

const RANK_TABS: { id: RankTab; label: string }[] = [
  { id: "topLiked", label: "Vinh danh" },
  { id: "topPosters", label: "Cao thủ phím" },
  { id: "newest", label: "Lính mới" },
  { id: "banned", label: "Phòng giam" },
];

export function RankingsPanel({ rankings }: { rankings: Rankings }) {
  const [tab, setTab] = useState<RankTab>("topLiked");
  const list = rankings[tab];
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="font-bold">🏆 Bảng xếp hạng</h2>
      </div>
      <div className="px-3 pt-3">
        <Tabs tabs={RANK_TABS} value={tab} onChange={setTab} />
      </div>
      {list.length === 0 ? (
        <Empty>{tab === "banned" ? "Phòng giam đang trống!" : "Chưa có ai trên bảng."}</Empty>
      ) : (
        <ol className="space-y-1 p-3">
          {list.map((u, i) => (
            <li key={u.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-panel-2">
              <span className={`w-5 text-center text-sm font-black ${i < 3 && tab !== "banned" && tab !== "newest" ? "text-brand" : "text-muted"}`}>{i + 1}</span>
              <Avatar user={u} size={30} />
              <div className="min-w-0 flex-1">
                <UserLink user={u} className="block truncate text-sm" />
                {tab === "banned" && u.banReason && <div className="truncate text-xs text-red-300">Lý do: {u.banReason}</div>}
              </div>
              <span className="shrink-0 text-xs text-muted">
                {tab === "topLiked" && `${formatNumber(u.likeCount)} ❤`}
                {tab === "topPosters" && `${formatNumber(u.postCount)} bài`}
                {tab === "newest" && timeAgo(u.createdAt)}
                {tab === "banned" && (u.bannedUntil ? `đến ${new Date(u.bannedUntil).toLocaleDateString("vi-VN")}` : "vĩnh viễn")}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

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
