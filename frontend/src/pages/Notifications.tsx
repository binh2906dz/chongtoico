import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api";
import { useAuth } from "../auth";
import { NotificationRow } from "../components/NotificationBell";
import { Empty, ErrorBox, Spinner } from "../components/ui";
import type { NotificationItem } from "../types";

export default function Notifications() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(before?: number) {
    setLoading(true);
    try {
      const res = await api<{ notifications: NotificationItem[]; hasMore: boolean }>(
        `/api/notifications${before ? `?before=${before}` : ""}`,
      );
      setItems((prev) => (before ? [...prev, ...res.notifications] : res.notifications));
      setHasMore(res.hasMore);
      if (!before && res.notifications.some((n) => !n.isRead)) await api("/api/notifications/read", { body: {} });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) void load();
  }, [user]);

  async function clearAll() {
    if (!confirm("Xoá toàn bộ thông báo?")) return;
    await api("/api/notifications", { method: "DELETE" });
    setItems([]);
    setHasMore(false);
  }

  if (authLoading) return <Spinner />;
  if (!user) {
    return (
      <div className="panel mx-auto max-w-lg p-8 text-center">
        <p className="text-muted">Đăng nhập để xem thông báo.</p>
        <Link to="/dang-nhap" className="btn-primary mt-4">
          Đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">🔔 Thông báo</h1>
        {items.length > 0 && (
          <button className="btn-ghost px-3 py-1.5 text-sm" onClick={clearAll}>
            Xoá tất cả
          </button>
        )}
      </div>
      <ErrorBox message={error} />
      <div className="panel divide-y divide-line overflow-hidden">
        {items.map((n) => (
          <NotificationRow key={n.id} n={n} />
        ))}
        {!loading && !items.length && <Empty>Chưa có thông báo nào.</Empty>}
        {loading && <Spinner />}
      </div>
      {hasMore && !loading && (
        <div className="text-center">
          <button className="btn-ghost px-4 py-1.5" onClick={() => load(items[items.length - 1]?.id)}>
            Xem thêm
          </button>
        </div>
      )}
    </div>
  );
}
