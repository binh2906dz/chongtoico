import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { Avatar, ErrorBox, Pagination, Spinner, Tabs, ThreadRows, UserLink } from "../components/ui";
import { formatNumber, timeAgo } from "../format";
import { useFetch } from "../useFetch";
import type { Author, ThreadItem } from "../types";

type Tab = "threads" | "feed" | "users";

function WatchedThreads() {
  const [page, setPage] = useState(1);
  const { data, error } = useFetch<{ threads: ThreadItem[]; page: number; totalPages: number }>(`/api/me/watching?page=${page}`);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;
  return (
    <>
      <ThreadRows threads={data.threads} empty="Bạn chưa theo dõi chủ đề nào. Bấm “Theo dõi” trong một chủ đề để thêm vào đây." />
      <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />
    </>
  );
}

function FollowingFeed() {
  const [page, setPage] = useState(1);
  const { data, error } = useFetch<{ threads: ThreadItem[]; page: number; hasMore: boolean }>(`/api/me/following-feed?page=${page}`);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;
  return (
    <>
      <ThreadRows threads={data.threads} empty="Chưa có chủ đề mới từ những người bạn theo dõi." />
      {(page > 1 || data.hasMore) && (
        <div className="flex justify-center gap-2 py-4">
          <button className="btn-ghost px-3 py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Mới hơn
          </button>
          <button className="btn-ghost px-3 py-1" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>
            Cũ hơn →
          </button>
        </div>
      )}
    </>
  );
}

function FollowedUsers() {
  const { data, error } = useFetch<{ users: (Author & { since: string; lastSeenAt: string; postCount: number })[] }>("/api/me/following");
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;
  if (!data.users.length) return <div className="p-10 text-center text-sm text-muted">Bạn chưa theo dõi thành viên nào.</div>;
  return (
    <ul className="divide-y divide-line">
      {data.users.map((u) => (
        <li key={u.id} className="flex items-center gap-3 px-4 py-3">
          <Avatar user={u} size={40} />
          <div className="min-w-0 flex-1">
            <UserLink user={u} />
            <div className="text-xs text-muted">
              {formatNumber(u.postCount)} bài viết · hoạt động {timeAgo(u.lastSeenAt)}
            </div>
          </div>
          <span className="text-xs text-muted">Theo dõi từ {timeAgo(u.since)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Following() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("threads");
  if (loading) return <Spinner />;
  if (!user) {
    return (
      <div className="panel p-10 text-center">
        <p className="text-muted">Đăng nhập để xem những gì bạn đang theo dõi.</p>
        <Link to="/dang-nhap" className="btn-primary mt-4">
          Đăng nhập
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Đang theo dõi</h1>
      <section className="panel">
        <div className="panel-head">
          <Tabs
            tabs={[
              { id: "threads", label: "Chủ đề theo dõi" },
              { id: "feed", label: "Bài từ người bạn theo dõi" },
              { id: "users", label: "Thành viên" },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
        {tab === "threads" && <WatchedThreads />}
        {tab === "feed" && <FollowingFeed />}
        {tab === "users" && <FollowedUsers />}
      </section>
    </div>
  );
}
