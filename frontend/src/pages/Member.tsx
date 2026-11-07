import { useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, errorMessage } from "../api";
import { useAuth } from "../auth";
import { Avatar, ErrorBox, RoleBadge, Spinner } from "../components/ui";
import { formatDate, formatNumber, roleLabel, timeAgo } from "../format";
import { useFetch } from "../useFetch";
import type { FollowStats, Profile } from "../types";

interface MemberData {
  user: Profile;
  recentThreads: { id: number; title: string; createdAt: string; replyCount: number; viewCount: number }[];
  follow: FollowStats;
}

function FollowButton({ username, initial }: { username: string; initial: FollowStats }) {
  const { user } = useAuth();
  const [stats, setStats] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted">
        <b className="text-slate-200">{formatNumber(stats.followerCount)}</b> người theo dõi ·{" "}
        <b className="text-slate-200">{formatNumber(stats.followingCount)}</b> đang theo dõi
      </span>
      {user && user.username.toLowerCase() !== username.toLowerCase() && (
        <button
          disabled={busy}
          className={stats.followedByMe ? "btn-ghost px-4 py-1.5" : "btn-primary px-4 py-1.5"}
          onClick={async () => {
            setBusy(true);
            try {
              setStats(await api<FollowStats>(`/api/members/${encodeURIComponent(username)}/follow`, { method: "POST" }));
            } catch (err) {
              alert(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {stats.followedByMe ? "✓ Đang theo dõi" : "+ Theo dõi"}
        </button>
      )}
    </div>
  );
}

function Settings({ onSaved }: { onSaved: () => void }) {
  const { user, setUser } = useAuth();
  const [bio, setBio] = useState(user?.bio ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(fn: () => Promise<void>, success: string) {
    setMsg(null);
    setError(null);
    try {
      await fn();
      setMsg(success);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="panel space-y-5 p-5">
      <h2 className="font-bold">Cài đặt tài khoản</h2>
      {msg && <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{msg}</div>}
      <ErrorBox message={error} />
      <div>
        <label className="label">Ảnh đại diện</label>
        <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
          Đổi ảnh đại diện
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const form = new FormData();
            form.append("file", file);
            void run(async () => {
              const res = await api<{ user: Profile }>("/api/me/avatar", { form });
              setUser(res.user);
            }, "Đã cập nhật ảnh đại diện.");
            e.target.value = "";
          }}
        />
      </div>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void run(async () => {
            const res = await api<{ user: Profile }>("/api/me", { method: "PATCH", body: { bio } });
            setUser(res.user);
          }, "Đã lưu giới thiệu.");
        }}
        className="space-y-2"
      >
        <label className="label">Giới thiệu bản thân</label>
        <textarea className="input" rows={3} maxLength={500} value={bio} onChange={(e) => setBio(e.target.value)} />
        <button className="btn-primary">Lưu</button>
      </form>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void run(async () => {
            await api("/api/auth/password", { body: { current, next } });
            setCurrent("");
            setNext("");
          }, "Đã đổi mật khẩu.");
        }}
        className="space-y-2"
      >
        <label className="label">Đổi mật khẩu</label>
        <input className="input" type="password" placeholder="Mật khẩu hiện tại" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        <input className="input" type="password" placeholder="Mật khẩu mới (ít nhất 6 ký tự)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        <button className="btn-primary" disabled={!current || next.length < 6}>
          Đổi mật khẩu
        </button>
      </form>
    </section>
  );
}

export default function Member() {
  const { username } = useParams();
  const { user: me } = useAuth();
  const { data, error, loading, reload } = useFetch<MemberData>(`/api/members/${username}`);
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox message={error} />;
  const { user } = data;
  const isMe = me?.id === user.id;
  const stats = [
    ["Chủ đề", user.threadCount],
    ["Bài viết", user.postCount],
    ["Được thích", user.likeCount],
    ["Tin nhắn chat", user.messageCount],
  ] as const;

  return (
    <div className="space-y-5">
      <section className="panel overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-brand/40 via-brand-2/30 to-transparent" />
        <div className="-mt-10 flex flex-wrap items-end gap-4 px-5 pb-5">
          <div className="rounded-full border-4 border-panel">
            <Avatar user={user} size={96} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className={`text-2xl font-black ${user.isBanned ? "text-slate-500 line-through" : ""}`}>{user.username}</h1>
            <div className="flex items-center gap-2 text-sm text-muted">
              <RoleBadge role={user.role} /> {roleLabel[user.role]} · Tham gia {formatDate(user.createdAt)} · Hoạt động {timeAgo(user.lastSeenAt)}
            </div>
          </div>
          <FollowButton key={user.id} username={user.username} initial={data.follow} />
        </div>
        {user.isBanned && (
          <div className="mx-5 mb-5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            🚫 Đang bị khoá{user.bannedUntil ? ` đến ${new Date(user.bannedUntil).toLocaleString("vi-VN")}` : " vĩnh viễn"}
            {user.banReason && ` — Lý do: ${user.banReason}`}
          </div>
        )}
        {user.bio && <p className="px-5 pb-5 whitespace-pre-wrap text-slate-300">{user.bio}</p>}
        <div className="grid grid-cols-2 border-t border-line sm:grid-cols-4">
          {stats.map(([k, v]) => (
            <div key={k} className="border-line p-4 text-center not-last:border-r">
              <div className="text-xl font-black">{formatNumber(v)}</div>
              <div className="text-xs text-muted">{k}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="panel lg:col-span-2">
          <div className="panel-head">
            <h2 className="font-bold">Chủ đề gần đây</h2>
          </div>
          {data.recentThreads.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">Chưa có chủ đề nào.</div>
          ) : (
            <ul className="divide-y divide-line">
              {data.recentThreads.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <Link to={`/chu-de/${t.id}`} className="min-w-0 truncate font-semibold hover:text-brand">
                    {t.title}
                  </Link>
                  <span className="shrink-0 text-xs text-muted">
                    {t.replyCount} trả lời · {timeAgo(t.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {isMe && <Settings onSaved={reload} />}
      </div>
    </div>
  );
}
