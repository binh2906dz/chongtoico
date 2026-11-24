import { useState } from "react";
import { api, errorMessage } from "../../api";
import { ErrorBox, Spinner } from "../../components/ui";
import { formatDate, formatNumber } from "../../format";
import { useFetch } from "../../useFetch";

/**
 * The backup and system screen of the admin panel.
 *
 * The dumps are made by pg_dump inside the app container and are kept in a
 * volume of their own, so they survive a restart of the container.
 */

interface SystemInfo {
  database: string;
  canDump: boolean;
  uploadsDir: string;
  backupDir: string;
  disk: { totalBytes: number; freeBytes: number; usedBytes: number };
  backups: { name: string; size: number; createdAt: string }[];
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function AdminSystem() {
  const { data, error, reload } = useFetch<SystemInfo>("/api/admin/system/info");
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function createBackup() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await api<{ name: string; size: number }>("/api/admin/system/backup", { method: "POST" });
      setNotice({ tone: "ok", message: `Đã tạo bản sao lưu ${res.name} (${formatBytes(res.size)}).` });
      reload();
    } catch (e) {
      setNotice({ tone: "err", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function removeBackup(name: string) {
    if (!window.confirm(`Xoá bản sao lưu "${name}"?`)) return;
    setNotice(null);
    try {
      await api(`/api/admin/system/backup/${encodeURIComponent(name)}/delete`, { method: "POST" });
      setNotice({ tone: "ok", message: "Đã xoá bản sao lưu." });
      reload();
    } catch (e) {
      setNotice({ tone: "err", message: errorMessage(e) });
    }
  }

  async function restoreBackup(name: string) {
    if (!window.confirm(`Khôi phục "${name}"? Toàn bộ dữ liệu hiện tại sẽ bị thay thế.`)) return;
    setBusy(true);
    setNotice(null);
    try {
      await api(`/api/admin/system/backup/${encodeURIComponent(name)}/restore`, { method: "POST" });
      setNotice({ tone: "ok", message: "Đã khôi phục xong. Hãy khởi động lại máy chủ nếu cần." });
    } catch (e) {
      setNotice({ tone: "err", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;

  const usedPercent = data.disk.totalBytes
    ? Math.round((data.disk.usedBytes / data.disk.totalBytes) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="panel p-4 text-sm text-muted">
        Sao lưu toàn bộ cơ sở dữ liệu bằng <b>pg_dump</b>. Bản sao lưu được giữ trong volume riêng nên không mất khi khởi
        động lại container. Nên chép sang máy khác — bản sao lưu nằm cùng VPS không cứu được khi mất VPS.
      </div>
      {notice && (
        <div
          className={
            notice.tone === "ok"
              ? "rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
              : "rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
          }
        >
          {notice.message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="panel p-4">
          <div className="text-sm font-bold">Cơ sở dữ liệu</div>
          <div className="text-xs text-muted">{data.database}</div>
        </div>
        <div className="panel p-4">
          <div className="text-2xl font-black">{formatBytes(data.disk.freeBytes)}</div>
          <div className="text-xs text-muted">Dung lượng còn trống</div>
        </div>
        <div className="panel p-4">
          <div className="text-2xl font-black">{usedPercent}%</div>
          <div className="text-xs text-muted">Ổ đĩa đã dùng</div>
        </div>
        <div className="panel p-4">
          <div className="text-2xl font-black">{data.backups.length}</div>
          <div className="text-xs text-muted">Bản sao lưu</div>
        </div>
      </div>

      <div className="panel space-y-2 p-4">
        <h2 className="text-lg font-bold">Sao lưu</h2>
        <p className="text-xs text-muted">
          Thư mục lưu trữ: <code className="font-mono">{data.backupDir}</code>
        </p>
        <button type="button" className="btn btn-accent" disabled={busy || !data.canDump} onClick={createBackup}>
          {busy ? "Đang tạo…" : "+ Tạo bản sao lưu ngay"}
        </button>
        {!data.canDump && (
          <p className="text-xs text-amber-300">
            Máy chủ hiện chạy PGlite nên không có pg_dump. Bản sao lưu chỉ dùng được trên bản triển khai PostgreSQL.
          </p>
        )}
      </div>

      {data.backups.length > 0 && (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted uppercase">
              <tr>
                <th className="p-3">Tên file</th>
                <th className="p-3">Dung lượng</th>
                <th className="p-3">Thời điểm</th>
                <th className="p-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {data.backups.map((b) => (
                <tr key={b.name} className="border-b border-line/60 last:border-0">
                  <td className="p-3 font-mono text-xs">{b.name}</td>
                  <td className="p-3">{formatBytes(b.size)}</td>
                  <td className="p-3 text-muted">{formatDate(b.createdAt)}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      <a className="btn btn-sm" href={`/api/admin/system/backup/${encodeURIComponent(b.name)}`} download>
                        Tải
                      </a>
                      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => restoreBackup(b.name)}>
                        Khôi phục
                      </button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => removeBackup(b.name)}>
                        Xoá
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel p-4 text-sm text-muted">
        Tổng dung lượng đã dùng: {formatNumber(Math.round(data.disk.usedBytes / 1024 / 1024))} MB. Thư mục tệp tải lên:{" "}
        <code className="font-mono">{data.uploadsDir}</code>
      </div>
    </div>
  );
}
