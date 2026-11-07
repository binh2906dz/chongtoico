import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../api";
import { ErrorBox, Pagination, Spinner, Tabs, UserLink } from "../../components/ui";
import { formatDate } from "../../format";
import { getSocket } from "../../socket";
import { useFetch } from "../../useFetch";
import type { Author } from "../../types";

type Status = "open" | "resolved" | "dismissed" | "all";

interface Report {
  id: number;
  targetType: "video" | "video_comment" | "post" | "site";
  targetId: number;
  reason: string;
  message: string;
  contact: string;
  status: Exclude<Status, "all">;
  handledAt: string | null;
  handlerName: string | null;
  createdAt: string;
  ip: string | null;
  reporter: Author | null;
  target: { label: string; url: string | null; excerpt?: string } | null;
}

const REASON_LABEL: Record<string, string> = {
  copyright: "Bản quyền",
  inappropriate: "Không phù hợp",
  spam: "Spam / lừa đảo",
  error: "Lỗi",
  other: "Khác",
};

const STATUS_LABEL: Record<Report["status"], string> = { open: "Chờ xử lý", resolved: "Đã xử lý", dismissed: "Bỏ qua" };

export default function AdminReports() {
  const [status, setStatus] = useState<Status>("open");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useFetch<{ reports: Report[]; page: number; totalPages: number; open: number }>(
    `/api/admin/reports?status=${status}&page=${page}`,
  );
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const s = getSocket();
    s.on("report:new", reload);
    return () => {
      s.off("report:new", reload);
    };
  }, [reload]);

  async function setReportStatus(r: Report, next: Report["status"], sameTarget = false) {
    setErr(null);
    try {
      await api(`/api/admin/reports/${r.id}`, { method: "PATCH", body: { status: next, sameTarget } });
      reload();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  return (
    <div className="space-y-3">
      <Tabs
        tabs={[
          { id: "open", label: `Chờ xử lý${data ? ` (${data.open})` : ""}` },
          { id: "resolved", label: "Đã xử lý" },
          { id: "dismissed", label: "Bỏ qua" },
          { id: "all", label: "Tất cả" },
        ]}
        value={status}
        onChange={(s) => {
          setStatus(s);
          setPage(1);
        }}
      />
      <p className="text-xs text-muted">
        Mở nội dung để xoá / khoá thành viên nếu vi phạm, sau đó bấm "Đã xử lý". "Đã xử lý" cũng đóng các báo cáo khác cùng nội dung.
      </p>
      <ErrorBox message={err} />
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : !data?.reports.length ? (
        <div className="panel p-8 text-center text-sm text-muted">Không có báo cáo nào.</div>
      ) : (
        <ul className="space-y-3">
          {data.reports.map((r) => (
            <li key={r.id} className="panel space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-300">{REASON_LABEL[r.reason] ?? r.reason}</span>
                {r.targetType === "site" ? (
                  <span className="font-semibold text-amber-300">Yêu cầu gỡ nội dung</span>
                ) : r.target?.url ? (
                  <Link to={r.target.url} target="_blank" className="font-semibold text-brand hover:underline">
                    {r.target.label}
                  </Link>
                ) : (
                  <span className="text-muted">{r.target?.label}</span>
                )}
                <span className="ml-auto text-xs text-muted">
                  #{r.id} · {formatDate(r.createdAt)}
                </span>
              </div>
              {r.target?.excerpt && <div className="rounded border border-line bg-panel-2/50 px-3 py-2 text-slate-300">{r.target.excerpt}</div>}
              {r.message && <div className="whitespace-pre-wrap break-words text-slate-200">{r.message}</div>}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span>
                  Người báo: {r.reporter ? <UserLink user={r.reporter} className="text-xs" /> : "Khách"}
                  {r.ip && ` (${r.ip})`}
                </span>
                {r.contact && <span className="text-slate-300">Liên hệ: {r.contact}</span>}
                <span>
                  Trạng thái: <b className="text-slate-300">{STATUS_LABEL[r.status]}</b>
                  {r.handlerName && ` bởi ${r.handlerName}`}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {r.status === "open" ? (
                  <>
                    <button className="btn-primary px-3 py-1" onClick={() => setReportStatus(r, "resolved", true)}>
                      Đã xử lý
                    </button>
                    <button className="btn-ghost px-3 py-1" onClick={() => setReportStatus(r, "dismissed")}>
                      Bỏ qua
                    </button>
                  </>
                ) : (
                  <button className="btn-ghost px-3 py-1" onClick={() => setReportStatus(r, "open")}>
                    Mở lại
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}
