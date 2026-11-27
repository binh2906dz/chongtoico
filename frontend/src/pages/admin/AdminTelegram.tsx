import { useMemo, useState } from "react";
import { api, errorMessage } from "../../api";
import { ErrorBox, Spinner } from "../../components/ui";
import { formatDate, formatNumber } from "../../format";
import { useFetch } from "../../useFetch";
import type {
  TelegramBotRow,
  TelegramCampaign,
  TelegramOverview,
  TelegramUserRow,
} from "../../types";

/* ------------------------------------------------------------------ *
 * Overview
 * ------------------------------------------------------------------ */

export function AdminTelegramOverview() {
  const { data, error } = useFetch<TelegramOverview>("/api/admin/telegram/overview");
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;
  const items = [
    ["Người Telegram", data.telegramUsers],
    ["Đã liên kết", data.linked],
    ["Từ chối nhận", data.optOut],
    ["Bị chặn", data.blocked],
    ["Tin đã gửi", data.sent],
    ["Lượt truy cập", data.visits],
    ["Lượt theo chiến dịch", data.clicks],
    ["CTR", `${data.ctr}%`],
  ] as const;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map(([k, v]) => (
          <div key={k} className="panel p-4">
            <div className="text-2xl font-black">{typeof v === "number" ? formatNumber(v) : v}</div>
            <div className="text-xs text-muted">{k}</div>
          </div>
        ))}
      </div>
      <div className="panel p-4 text-sm text-muted">
        Kênh Telegram là nơi nhắc người dùng quay lại website. Người dùng mở Mini App sẽ tự có tài khoản và xem được nội
        dung "chỉ thành viên". Mọi tin nhắn đều bị giới hạn tần suất và có nút <b>Từ chối nhận</b>.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Bots
 * ------------------------------------------------------------------ */

const botStatusLabel: Record<string, string> = {
  live: "Hoạt động",
  ban: "Bị ban",
  error: "Lỗi",
  unknown: "Chưa kiểm tra",
};

export function AdminTelegramBots() {
  const { data, error, reload } = useFetch<{ rows: TelegramBotRow[] }>("/api/admin/telegram/bots");
  const [msg, setMsg] = useState<string | null>(null);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;

  async function patch(id: string, body: Record<string, unknown>) {
    setMsg(null);
    try {
      await api(`/api/admin/telegram/bots/${id}`, { method: "PATCH", body });
      reload();
    } catch (e) {
      setMsg(errorMessage(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel p-4 text-sm text-muted">
        Token bot nằm trong service bot (tiến trình riêng), không có trong web. Danh sách này chỉ chứa thông tin vận
        hành. <b>Trọng số</b> quyết định tỉ lệ chia tin nhắn giữa các bot.
      </div>
      {msg && <ErrorBox message={msg} />}
      {data.rows.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted">
          Chưa có bot nào đăng ký. Khởi động service bot để nó tự đăng ký.
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted uppercase">
              <tr>
                <th className="px-3 py-2">Bot</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2">Trọng số</th>
                <th className="px-3 py-2">Đã gửi</th>
                <th className="px-3 py-2">Bị chặn</th>
                <th className="px-3 py-2">Kiểm tra lần cuối</th>
                <th className="px-3 py-2 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((b) => (
                <tr key={b.id} className="border-b border-line/60">
                  <td className="px-3 py-2">
                    <div className="font-semibold">{b.displayName || b.id}</div>
                    <div className="text-xs text-muted">{b.username ? `@${b.username}` : b.id}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`badge ${
                        b.status === "live"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : b.status === "ban"
                            ? "bg-red-500/20 text-red-300"
                            : "bg-slate-500/20 text-slate-300"
                      }`}
                    >
                      {botStatusLabel[b.status] ?? b.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      defaultValue={b.weight}
                      className="input w-20"
                      onBlur={(e) => {
                        const value = Number(e.target.value);
                        if (value !== b.weight && value >= 1 && value <= 100) void patch(b.id, { weight: value });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">{formatNumber(b.sentCount)}</td>
                  <td className="px-3 py-2">{formatNumber(b.blockedCount)}</td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {b.lastCheckedAt ? formatDate(b.lastCheckedAt) : "—"}
                    {b.lastError && <div className="text-red-300">{b.lastError}</div>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="btn-ghost px-3 py-1"
                      onClick={() => void api(`/api/admin/telegram/bots/${b.id}/check`, { method: "POST" }).then(reload)}
                    >
                      Kiểm tra
                    </button>{" "}
                    <button
                      className="btn-ghost px-3 py-1"
                      onClick={() => void patch(b.id, { autoResponder: !b.autoResponder })}
                    >
                      {b.autoResponder ? "Tạm dừng" : "Bật lại"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

export function AdminTelegramUsers() {
  const [status, setStatus] = useState("");
  const { data, error, reload } = useFetch<{ rows: TelegramUserRow[] }>(
    `/api/admin/telegram/users${status ? `?status=${status}` : ""}`,
  );
  const [msg, setMsg] = useState<string | null>(null);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;

  async function patch(telegramId: number, body: Record<string, unknown>) {
    setMsg(null);
    try {
      await api(`/api/admin/telegram/users/${telegramId}`, { method: "PATCH", body });
      reload();
    } catch (e) {
      setMsg(errorMessage(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="active">Hoạt động</option>
          <option value="blocked">Bị chặn</option>
          <option value="invalid">Không hợp lệ</option>
          <option value="unknown">Chưa rõ</option>
        </select>
      </div>
      {msg && <ErrorBox message={msg} />}
      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted uppercase">
            <tr>
              <th className="px-3 py-2">Telegram</th>
              <th className="px-3 py-2">Tài khoản web</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2">Nhận thông báo</th>
              <th className="px-3 py-2">Lần cuối vào web</th>
              <th className="px-3 py-2 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((u) => (
              <tr key={u.telegramId} className="border-b border-line/60">
                <td className="px-3 py-2">
                  <div className="font-semibold">{u.firstName || u.username || `#${u.telegramId}`}</div>
                  <div className="text-xs text-muted">{u.username ? `@${u.username}` : u.telegramId}</div>
                </td>
                <td className="px-3 py-2 text-xs">{u.linkedUsername ?? "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`badge ${
                      u.status === "active"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : u.status === "blocked"
                          ? "bg-red-500/20 text-red-300"
                          : "bg-slate-500/20 text-slate-300"
                    }`}
                  >
                    {botStatusLabel[u.status] ?? u.status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {u.optOut ? (
                    <span className="badge bg-red-500/20 text-red-300">Từ chối</span>
                  ) : u.notifyEnabled ? (
                    <span className="badge bg-emerald-500/20 text-emerald-300">Bật</span>
                  ) : (
                    <span className="badge bg-slate-500/20 text-slate-300">Tắt</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted">{u.lastSeenAt ? formatDate(u.lastSeenAt) : "—"}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    className="btn-ghost px-3 py-1"
                    onClick={() => void patch(u.telegramId, { status: u.status === "blocked" ? "active" : "blocked" })}
                  >
                    {u.status === "blocked" ? "Mở lại" : "Chặn"}
                  </button>{" "}
                  <button
                    className="btn-ghost px-3 py-1"
                    onClick={() => void patch(u.telegramId, { notifyEnabled: !u.notifyEnabled })}
                  >
                    {u.notifyEnabled ? "Tắt thông báo" : "Bật thông báo"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Campaigns
 * ------------------------------------------------------------------ */

const targetLabel: Record<string, string> = {
  all_linked: "Tất cả người đã liên kết",
  visited: "Người đã từng vào web",
  stalled: "Hồi sinh (≥14 ngày không vào)",
  status: "Theo trạng thái",
  ids: "Danh sách ID cụ thể",
  imported: "Toàn bộ ID đã nhập",
};

const scheduleLabel: Record<string, string> = {
  now: "Gửi ngay",
  at: "Hẹn giờ",
  daily: "Hằng ngày",
  weekly: "Hằng tuần",
};

const WEEKDAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

export function AdminTelegramCampaigns() {
  const { data, error, reload } = useFetch<{ rows: TelegramCampaign[] }>("/api/admin/telegram/campaigns");
  const [msg, setMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;

  async function act(id: string, action: string, label: string) {
    setMsg(null);
    try {
      const res = await api<{ queued?: number; skipped?: number; reasons?: Record<string, number> }>(
        `/api/admin/telegram/campaigns/${id}/${action}`,
        { method: "POST" },
      );
      if (action === "send") {
        const reasons = Object.entries(res.reasons ?? {})
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        setMsg(`${label} — sẽ gửi tới ${res.queued ?? 0} người, bỏ qua ${res.skipped ?? 0}.${reasons ? ` (${reasons})` : ""}`);
      } else {
        setMsg(`${label} thành công.`);
      }
      reload();
    } catch (e) {
      setMsg(errorMessage(e));
    }
  }

  /**
   * Delete a campaign for good.
   *
   * The campaign and every job of it disappear, so nothing is sent any more.
   */
  async function remove(c: TelegramCampaign) {
    const ok = window.confirm(
      `Xoá chiến dịch "${c.name}"?\n\n` +
        `Toàn bộ tin nhắn của chiến dịch này sẽ bị xoá khỏi hàng đợi và không thể gửi lại.`,
    );
    if (!ok) return;
    setMsg(null);
    try {
      await api(`/api/admin/telegram/campaigns/${c.id}`, { method: "DELETE" });
      setMsg(`Đã xoá chiến dịch "${c.name}".`);
      reload();
    } catch (e) {
      setMsg(errorMessage(e));
    }
  }

  /** Cancel a running campaign — the messages that are left stop. */
  async function cancel(c: TelegramCampaign) {
    const ok = window.confirm(
      `Huỷ chiến dịch "${c.name}"?\n\n` +
        `Những tin nhắn chưa gửi sẽ dừng lại. Bạn có thể xoá hẳn chiến dịch nếu không cần nữa.`,
    );
    if (!ok) return;
    await act(c.id, "cancel", `Đã huỷ chiến dịch "${c.name}"`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Đóng" : "+ Soạn chiến dịch"}
        </button>
      </div>
      {msg && <div className="rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-sm text-brand-2">{msg}</div>}
      {showForm && <CampaignForm onCreated={() => { setShowForm(false); reload(); }} />}

      {data.rows.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted">Chưa có chiến dịch nào.</div>
      ) : (
        <div className="space-y-3">
          {data.rows.map((c) => (
            <div key={c.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold">{c.name}</div>
                  <div className="mt-1 line-clamp-2 text-sm text-muted">{c.text || "(không có nội dung)"}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="badge bg-slate-500/20 text-slate-300">{targetLabel[c.targetType] ?? c.targetType}</span>
                    <span className="badge bg-slate-500/20 text-slate-300">{scheduleLabel[c.schedule] ?? c.schedule}</span>
                    {c.schedule !== "now" && (
                      <span className="badge bg-slate-500/20 text-slate-300">
                        {String(c.hour).padStart(2, "0")}:{String(c.minute).padStart(2, "0")}
                        {c.schedule === "weekly" && c.dayOfWeek !== null ? ` · ${WEEKDAYS[c.dayOfWeek]}` : ""}
                      </span>
                    )}
                    <span
                      className={`badge ${
                        c.scheduleStatus === "active"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {c.scheduleStatus === "active" ? "Lịch đang bật" : "Lịch đang tạm dừng"}
                    </span>
                    {c.mediaType && c.mediaType !== "none" && (
                      <span className="badge bg-sky-500/20 text-sky-300">
                        {c.mediaType === "video" ? "🎬 Video" : "🖼️ Ảnh"}
                      </span>
                    )}
                    {c.isEmergency && (
                      <span className="badge bg-amber-500/20 text-amber-300">⚡ Khẩn cấp</span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-muted">
                    Đã gửi {formatNumber(c.sentCount)}/{formatNumber(c.total)} · lỗi {formatNumber(c.failedCount)} · trạng thái{" "}
                    {c.status}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button className="btn-primary px-3 py-1" onClick={() => void act(c.id, "send", `Đã gửi chiến dịch "${c.name}"`)}>
                    Gửi ngay
                  </button>
                  {c.scheduleStatus === "active" ? (
                    <button className="btn-ghost px-3 py-1" onClick={() => void act(c.id, "pause", "Đã tạm dừng lịch")}>
                      Tạm dừng lịch
                    </button>
                  ) : (
                    <button className="btn-ghost px-3 py-1" onClick={() => void act(c.id, "activate", "Đã bật lịch")}>
                      Kích hoạt lịch
                    </button>
                  )}
                  {/* The cancel button only makes sense while the campaign is
                      still moving — a finished campaign is simply deleted. */}
                  {(c.status === "queued" || c.status === "sending" || c.status === "paused") && (
                    <button className="btn-ghost px-3 py-1" onClick={() => void cancel(c)}>
                      Huỷ
                    </button>
                  )}
                  <button
                    className="btn bg-red-500/20 px-3 py-1 text-red-300 hover:bg-red-500/30"
                    title="Xoá chiến dịch và toàn bộ tin nhắn của nó"
                    onClick={() => void remove(c)}
                  >
                    Xoá
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [targetType, setTargetType] = useState("all_linked");
  const [targetStatuses, setTargetStatuses] = useState<string[]>(["active"]);
  const [targetIds, setTargetIds] = useState("");
  const [schedule, setSchedule] = useState("now");
  const [scheduledAtLocal, setScheduledAtLocal] = useState("");
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [mediaType, setMediaType] = useState("none");
  const [mediaKey, setMediaKey] = useState("");
  const [mediaSource, setMediaSource] = useState<"article" | "upload" | null>(null);
  const [isEmergency, setIsEmergency] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [articleIds, setArticleIds] = useState<number[]>([]);  const [buttons, setButtons] = useState<{ label: string; url: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: recent } = useFetch<{
    rows: {
      id: number;
      title: string;
      visibility: string;
      createdAt: string;
      media: { kind: "image" | "video"; key: string; ext?: string }[];
    }[];
  }>("/api/admin/telegram/articles/recent?hours=720");

  // The imported ids grouped by their status, so the admin picks a group.
  const { data: idGroups } = useFetch<{
    groups: { status: string; count: number; label: string }[];
    total: number;
  }>("/api/admin/telegram/ids/groups");

  // The saved message templates, so a sentence can be inserted with one click.
  const { data: templateData } = useFetch<{
    templates: { id: string; title: string; text: string }[];
    schedule: { enabled: boolean; hour: number; minute: number };
  }>("/api/admin/telegram/settings");
  const templates = templateData?.templates ?? [];

  // The daily send hour the admin set in the settings is the default here.
  const defaultSchedule = templateData?.schedule;
  const [hourTouched, setHourTouched] = useState(false);
  const effectiveHour = hourTouched ? hour : (defaultSchedule?.hour ?? hour);
  const effectiveMinute = hourTouched ? minute : (defaultSchedule?.minute ?? minute);

  const preview = useMemo(() => {
    const lines = text.split("\n").filter(Boolean);
    return lines.map((line) => line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  }, [text]);

  const parsedTargetIds = useMemo(
    () =>
      targetIds
        .split(/[\r\n,;\s]+/)
        .map((x) => Number(x.trim()))
        .filter((x) => Number.isInteger(x) && x > 0),
    [targetIds],
  );

  const linkedArticles = useMemo(
    () => (recent?.rows ?? []).filter((a) => articleIds.includes(a.id)),
    [recent, articleIds],
  );

  async function submit(sendNow = false) {
    setBusy(true);
    setError(null);
    setMsg(null);
    // The emergency button always sends as an emergency campaign, even when the
    // box was not ticked.
    const emergency = sendNow || isEmergency;
    try {
      const res = await api<{ campaign: TelegramCampaign }>("/api/admin/telegram/campaigns", {
        body: {
          name: name || "Chiến dịch mới",
          text,
          mediaType,
          mediaSource: mediaType === "none" ? null : mediaSource,
          mediaKey: mediaType === "none" ? null : mediaKey || null,
          targetType,
          targetIds:
            targetType === "status" || targetType === "imported"
              ? targetStatuses
              : targetType === "ids"
                ? parsedTargetIds
                : [],
          isEmergency: emergency,
          schedule: sendNow ? "now" : schedule,
          hour: effectiveHour,
          minute: effectiveMinute,
          dayOfWeek: schedule === "weekly" ? dayOfWeek : null,
          // datetime-local gives browser-local time; the campaign runs on
          // Vietnam time, so the value is converted to UTC here.
          scheduledAt:
            schedule === "at" && scheduledAtLocal
              ? new Date(`${scheduledAtLocal}:00+07:00`).toISOString()
              : undefined,
          buttons,
          articleIds,
        },
      });
      // The emergency button sends the campaign right away.
      if (sendNow) {
        const sent = await api<{ queued: number; skipped: number }>(
          `/api/admin/telegram/campaigns/${res.campaign.id}/send`,
          { method: "POST" },
        );
        setMsg(
          `⚡ Đã gửi khẩn cấp "${res.campaign.name}": ${sent.queued} tin nhắn vào hàng đợi` +
            (sent.skipped ? `, bỏ qua ${sent.skipped}.` : "."),
        );
      } else {
        setMsg(`Đã tạo chiến dịch "${res.campaign.name}". Bấm "Gửi ngay" hoặc "Kích hoạt lịch" để chạy.`);
      }
      setName("");
      setText("");
      setButtons([]);
      setArticleIds([]);
      setMediaKey("");
      setMediaSource(null);
      setIsEmergency(false);
      onCreated();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /** Upload a media file for this campaign. */
  async function uploadMedia(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/telegram/campaigns/media", {
        method: "POST",
        body,
        credentials: "include",
        headers: { "x-requested-with": "ctc" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Không tải lên được.");
      setMediaType(data.type);
      setMediaKey(data.key);
      setMediaSource("upload");
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Không tải lên được.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="panel space-y-4 p-4">
      <h2 className="font-black">Soạn chiến dịch nhắc nhở</h2>
      {error && <ErrorBox message={error} />}
      {msg && <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{msg}</div>}

      <div>
        <label className="label">Tên chiến dịch</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Bài mới hôm nay 24/11" />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="label mb-0">Nội dung tin nhắn</label>
          {templates.length > 0 && (
            <select
              className="input max-w-56 py-1 text-xs"
              value=""
              onChange={(e) => {
                const tpl = templates.find((t) => t.id === e.target.value);
                if (tpl) setText((prev) => (prev.trim() ? `${prev.trim()}\n${tpl.text}` : tpl.text));
                e.target.value = "";
              }}
            >
              <option value="">Chèn mẫu tin nhắn…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
        </div>
        <textarea
          className="input min-h-28"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nội dung sẽ gửi cho người dùng. Có thể chứa HTML cơ bản."
        />
        {preview.length > 0 && (
          <div className="mt-2 rounded-lg bg-panel-2 p-3 text-sm">
            <div className="mb-1 text-xs text-muted">Xem trước</div>
            {preview.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white">🌐 Mở Website</span>
              <span className="rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-semibold">🔕 Từ chối nhận</span>
              {buttons.map((b, i) => (
                <span key={i} className="rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-semibold">
                  {b.label}
                </span>
              ))}
            </div>
            {linkedArticles.length > 0 && (
              <div className="mt-2 border-t border-line pt-2 text-xs">
                {linkedArticles.map((a) => (
                  <div key={a.id} className="text-brand-2">
                    👉 {a.title}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="label">Gắn bài viết (tự thêm link vào nội dung)</label>
        <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-line bg-panel-2 p-2">
          {(recent?.rows ?? []).length === 0 && (
            <div className="px-1 py-2 text-xs text-muted">Chưa có bài viết nào trong 30 ngày gần đây.</div>
          )}
          {(recent?.rows ?? []).map((a) => {
            const on = articleIds.includes(a.id);
            return (
              <label
                key={a.id}
                className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs ${
                  on ? "bg-brand/20 text-brand-2" : "hover:bg-panel"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={on}
                  onChange={() => setArticleIds((prev) => (on ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
                />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{a.title}</span>
                  {a.visibility === "members" && (
                    <span className="text-amber-300/80">Chỉ thành viên — người chưa đăng nhập sẽ không xem được</span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-muted">
          Link bài được thêm vào cuối nội dung. Bài "chỉ thành viên" vẫn hiện link nhưng cần đăng nhập mới xem được.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Media đính kèm</label>
          <select
            className="input"
            value={mediaType}
            onChange={(e) => {
              setMediaType(e.target.value);
              if (e.target.value === "none") {
                setMediaKey("");
                setMediaSource(null);
              }
            }}
          >
            <option value="none">Không kèm media</option>
            <option value="image">Kèm ảnh</option>
            <option value="video">Kèm video</option>
          </select>
          {mediaType !== "none" && (
            <>
              <label className="mt-2 block text-sm">
                <span className="mb-1 block text-xs text-muted">
                  Tải file mới lên (ảnh jpg/png/webp, video mp4/webm/mov)
                </span>
                <input
                  className="input w-full"
                  type="file"
                  accept={mediaType === "video" ? "video/mp4,video/webm,video/quicktime" : "image/*"}
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadMedia(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {uploading && <p className="mt-1 text-xs text-muted">Đang tải lên…</p>}
              {uploadError && <p className="mt-1 text-xs text-rose-300">{uploadError}</p>}
              {mediaKey && (
                <p className="mt-1 text-xs text-muted">
                  Đã chọn file <b className="font-mono">{mediaKey}</b>
                  {mediaSource === "upload" ? " (file tải lên)" : mediaSource === "article" ? " (file của bài viết)" : ""}
                </p>
              )}

              <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-line bg-panel-2 p-2">
                <div className="px-2 py-1 text-[11px] font-semibold uppercase text-muted">
                  Hoặc chọn file có sẵn trong bài viết
                </div>
                {(recent?.rows ?? []).length === 0 && (
                  <div className="px-1 py-2 text-xs text-muted">Chưa có bài viết nào trong 30 ngày gần đây.</div>
                )}
                {(recent?.rows ?? []).map((a) => {
                  const files = a.media.filter((m) => m.kind === mediaType);
                  if (!files.length) return null;
                  return (
                    <div key={a.id}>
                      <div className="px-2 pt-1 text-[11px] font-semibold uppercase text-muted">
                        {a.title}
                        {a.visibility === "members" && (
                          <span className="ml-2 normal-case text-amber-300/80">chỉ thành viên</span>
                        )}
                      </div>
                      {files.map((m, i) => {
                        const value = m.kind === "video" ? `video:${m.key}.${m.ext ?? "mp4"}` : `image:${m.key}`;
                        const on = mediaKey === value;
                        return (
                          <label
                            key={`${m.key}-${i}`}
                            className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                              on ? "bg-brand/20 text-brand-2" : "hover:bg-panel"
                            }`}
                          >
                            <input
                              type="radio"
                              name="media"
                              className="mt-0.5"
                              checked={on}
                              onChange={() => {
                                setMediaKey(value);
                                setMediaSource("article");
                              }}
                            />
                            <span className="font-mono">{m.key}</span>
                            <span className="text-muted">({m.kind === "video" ? m.ext ?? "mp4" : "webp"})</span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              {mediaKey && (
                <p className="mt-1 text-xs text-muted">
                  Đã chọn file <b className="font-mono">{mediaKey}</b>.
                </p>
              )}
              <p className="mt-1 text-xs text-muted">
                File "chỉ thành viên" sẽ bị Telegram chặn — hãy dùng ảnh/video công khai kèm link bài.
              </p>
            </>
          )}
        </div>

        <div>
          <label className="label">Đối tượng nhận</label>
          <select className="input" value={targetType} onChange={(e) => setTargetType(e.target.value)}>
            <option value="all_linked">Tất cả người đã liên kết</option>
            <option value="visited">Người đã từng vào web</option>
            <option value="stalled">Hồi sinh (≥14 ngày không vào)</option>
            <option value="imported">Toàn bộ ID đã nhập (mục Nhập ID)</option>
            <option value="status">Theo trạng thái</option>
            <option value="ids">Danh sách ID cụ thể</option>
          </select>

          {targetType === "imported" && (
            <div className="mt-2 space-y-2">
              <div className="rounded-lg border border-line bg-panel-2 p-2">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-semibold">Lọc theo nhóm (bỏ trống = gửi tất cả)</span>
                  <span className="text-muted">Tổng: {idGroups?.total ?? 0} id</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(idGroups?.groups ?? []).map((g) => {
                    const on = targetStatuses.includes(g.status);
                    return (
                      <button
                        type="button"
                        key={g.status}
                        className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
                          on ? "border-brand bg-brand/20 text-brand-2" : "border-line bg-panel text-muted"
                        }`}
                        onClick={() =>
                          setTargetStatuses((prev) => (on ? prev.filter((x) => x !== g.status) : [...prev, g.status]))
                        }
                      >
                        {g.label} ({g.count})
                      </button>
                    );
                  })}
                  {(idGroups?.groups ?? []).length === 0 && (
                    <div className="px-1 py-1 text-xs text-muted">Chưa có ID nào trong danh sách.</div>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted">
                  {targetStatuses.length === 0
                    ? "Chưa chọn nhóm nào — sẽ gửi cho toàn bộ ID đã nhập."
                    : `Sẽ gửi cho ${targetStatuses
                        .map((s) => idGroups?.groups.find((g) => g.status === s)?.count ?? 0)
                        .reduce((a, b) => a + b, 0)} id thuộc nhóm đã chọn.`}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Để gửi tới <b>toàn bộ ID</b> thì <b>không chọn nhóm nào</b> và bật <b>⚡ Gửi khẩn cấp</b> — mọi id
                  trong danh sách đều được gửi, kể cả id Telegram báo lỗi trước đó. Các nhóm chỉ là thống kê cho biết
                  id nào còn dùng được; Telegram báo "không tìm thấy" hoặc "bị chặn" thì id đó được ghi lại ở mục{" "}
                  <b>Nhập ID</b>.
                </p>
              </div>
            </div>
          )}

          {targetType === "status" && (
            <div className="mt-2 flex flex-wrap gap-2">
              {["active", "blocked", "invalid", "unknown"].map((s) => {
                const on = targetStatuses.includes(s);
                return (
                  <button
                    type="button"
                    key={s}
                    className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
                      on ? "border-brand bg-brand/20 text-brand-2" : "border-line bg-panel text-muted"
                    }`}
                    onClick={() =>
                      setTargetStatuses((prev) => (on ? prev.filter((x) => x !== s) : [...prev, s]))
                    }
                  >
                    {s === "active" ? "Hoạt động" : s === "blocked" ? "Bị chặn" : s === "invalid" ? "Không hợp lệ" : "Chưa rõ"}
                  </button>
                );
              })}
            </div>
          )}

          {targetType === "ids" && (
            <div className="mt-2">
              <textarea
                className="input min-h-24 font-mono text-xs"
                value={targetIds}
                onChange={(e) => setTargetIds(e.target.value)}
                placeholder={"123456789\n987654321"}
              />
              <p className="mt-1 text-xs text-muted">
                Đã nhập <b>{parsedTargetIds.length}</b> id hợp lệ. Có thể nhập trước ở tab <b>Nhập ID</b>.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div>
          <label className="label">Lịch gửi</label>
          <select className="input" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
            <option value="now">Gửi ngay</option>
            <option value="at">Hẹn giờ cụ thể</option>
            <option value="daily">Hằng ngày</option>
            <option value="weekly">Hằng tuần</option>
          </select>
        </div>
        {schedule === "at" ? (
          <div>
            <label className="label">Thời điểm gửi (VN)</label>
            <input
              type="datetime-local"
              className="input"
              value={scheduledAtLocal}
              onChange={(e) => setScheduledAtLocal(e.target.value)}
            />
          </div>
        ) : (
          <>
            <div>
              <label className="label">Giờ (VN)</label>
              <input
                type="number"
                min={0}
                max={23}
                className="input"
                value={effectiveHour}
                onChange={(e) => {
                  setHourTouched(true);
                  setHour(Number(e.target.value));
                }}
              />
            </div>
            <div>
              <label className="label">Phút</label>
              <input
                type="number"
                min={0}
                max={59}
                className="input"
                value={effectiveMinute}
                onChange={(e) => {
                  setHourTouched(true);
                  setMinute(Number(e.target.value));
                }}
              />
            </div>
          </>
        )}
        {schedule === "weekly" && (
          <div>
            <label className="label">Thứ</label>
            <select className="input" value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
              {WEEKDAYS.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="label">Nút trong tin nhắn</label>
        <div className="space-y-2">
          {buttons.map((b, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="input w-40"
                placeholder="Nhãn"
                value={b.label}
                onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <input
                className="input flex-1"
                placeholder="https://tenmien.com/..."
                value={b.url}
                onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
              />
              <button className="btn-ghost px-3" onClick={() => setButtons(buttons.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          <button className="btn-ghost px-3 py-1" onClick={() => setButtons([...buttons, { label: "", url: "" }])}>
            + Thêm nút
          </button>
        </div>
      </div>

      <div className="rounded-lg bg-panel-2 p-3 text-xs text-muted">
        Giới hạn cứng: tối đa 1 tin/ngày/người · 3 tin/tuần/người · ít nhất 6 giờ giữa 2 tin · chỉ gửi trong khung 08:00–22:00
        (giờ Việt Nam). Lịch mặc định <b>tạm dừng</b> — phải bấm "Kích hoạt lịch" mới chạy.
      </div>

      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={isEmergency}
            onChange={(e) => setIsEmergency(e.target.checked)}
          />
          <span>
            <b>⚡ Gửi khẩn cấp</b>
            <span className="block text-xs text-muted">
              Bỏ qua mọi luật giới hạn tần suất (1/ngày, 3/tuần, 6 giờ) và khung giờ 08:00–22:00 — tin nhắn đi
              ngay. Dùng để quét toàn bộ danh sách ID: id nào Telegram báo lỗi sẽ được ghi lại ở mục{" "}
              <b>Nhập ID</b>.
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy} onClick={() => void submit()}>
          {busy ? "Đang lưu..." : "Lưu chiến dịch"}
        </button>
        <button
          className="btn bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50"
          disabled={busy}
          title="Tạo và gửi ngay, bỏ qua mọi luật giới hạn tần suất"
          onClick={() => void submit(true)}
        >
          {busy ? "Đang gửi..." : "⚡ Gửi khẩn cấp"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Import ids
 * ------------------------------------------------------------------ */

export function AdminTelegramImport() {
  const [content, setContent] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, error: listError, reload } = useFetch<{
    rows: {
      telegramId: number;
      username: string | null;
      firstName: string | null;
      status: string;
      linkedUserId: number | null;
    }[];
  }>("/api/admin/telegram/imported-ids");

  // The imported ids grouped by their status.
  const { data: idGroups, reload: reloadGroups } = useFetch<{
    groups: { status: string; count: number; label: string }[];
    total: number;
  }>("/api/admin/telegram/ids/groups");

  async function submit() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await api<{ imported: number }>("/api/admin/telegram/import-ids", { body: { content } });
      setMsg(`Đã nhập ${res.imported} Telegram id.`);
      setContent("");
      reload();
      reloadGroups();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="panel space-y-3 p-4">
        <h2 className="font-black">Nhập danh sách Telegram id</h2>
        {error && <ErrorBox message={error} />}
        {msg && <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{msg}</div>}
        <p className="text-sm text-muted">
          Mỗi dòng một id (hoặc cột CSV). Id sẽ được lưu và có thể chọn làm đối tượng nhận của chiến dịch.
        </p>
        <textarea
          className="input min-h-40 font-mono text-xs"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={"123456789\n987654321"}
        />
        <button className="btn-primary" disabled={busy} onClick={() => void submit()}>
          {busy ? "Đang nhập..." : "Nhập danh sách"}
        </button>
      </div>

      {idGroups && idGroups.groups.length > 0 && (
        <div className="panel p-4">
          <h2 className="font-black">Phân loại ID ({idGroups.total} id)</h2>
          <p className="mt-1 text-sm text-muted">
            Trạng thái được cập nhật tự động khi chiến dịch gửi tới: Telegram báo lỗi thì id đó chuyển sang nhóm
            tương ứng. Lần quét đầu tiên hãy gửi cho toàn bộ id, các lần sau chỉ gửi nhóm <b>Hoạt động</b>.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {idGroups.groups.map((g) => (
              <div
                key={g.status}
                className={`rounded-lg border p-3 ${
                  g.status === "active"
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : g.status === "blocked"
                      ? "border-rose-500/40 bg-rose-500/10"
                      : g.status === "invalid"
                        ? "border-slate-500/40 bg-slate-500/10"
                        : "border-line bg-panel-2"
                }`}
              >
                <div className="text-xs text-muted">{g.label}</div>
                <div className="text-xl font-black">{formatNumber(g.count)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-black">Telegram đã biết ({rows.length})</h2>
          <button
            className="btn-ghost px-3 py-1 text-xs"
            onClick={() => {
              const text = rows.map((r) => r.telegramId).join("\n");
              void navigator.clipboard?.writeText(text);
            }}
          >
            Copy tất cả id
          </button>
        </div>
        {listError && <ErrorBox message={listError} />}
        {rows.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted">Chưa có Telegram id nào.</div>
        ) : (
          <div className="max-h-96 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted uppercase">
                <tr>
                  <th className="px-3 py-2">Telegram</th>
                  <th className="px-3 py-2">Telegram ID</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2">Đã liên kết</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.telegramId} className="border-b border-line/60">
                    <td className="px-3 py-2 font-semibold">
                      {r.firstName || r.username || `#${r.telegramId}`}
                      {r.username && <div className="text-xs text-muted">@{r.username}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.telegramId}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`badge ${
                          r.status === "active"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : r.status === "blocked"
                              ? "bg-red-500/20 text-red-300"
                              : "bg-slate-500/20 text-slate-300"
                        }`}
                      >
                        {botStatusLabel[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">{r.linkedUserId ? "Có" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
