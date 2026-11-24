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
                  <button className="btn-ghost px-3 py-1" onClick={() => void act(c.id, "cancel", "Đã huỷ chiến dịch")}>
                    Huỷ
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
  const [schedule, setSchedule] = useState("now");
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [mediaType, setMediaType] = useState("none");
  const [articleId, setArticleId] = useState("");
  const [buttons, setButtons] = useState<{ label: string; url: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: recent } = useFetch<{ rows: { id: number; title: string; visibility: string; createdAt: string }[] }>(
    "/api/admin/telegram/articles/recent?hours=720",
  );

  const preview = useMemo(() => {
    const lines = text.split("\n").filter(Boolean);
    return lines.map((line) => line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  }, [text]);

  async function submit() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await api<{ campaign: TelegramCampaign }>("/api/admin/telegram/campaigns", {
        body: {
          name: name || "Chiến dịch mới",
          text,
          mediaType,
          mediaSource: mediaType === "none" ? null : "article",
          mediaKey: mediaType === "none" ? null : articleId || null,
          targetType,
          targetIds: [],
          schedule,
          hour,
          minute,
          dayOfWeek: schedule === "weekly" ? dayOfWeek : null,
          buttons,
        },
      });
      setMsg(`Đã tạo chiến dịch "${res.campaign.name}". Bấm "Gửi ngay" hoặc "Kích hoạt lịch" để chạy.`);
      setName("");
      setText("");
      setButtons([]);
      onCreated();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
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
        <label className="label">Nội dung tin nhắn</label>
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
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Media đính kèm</label>
          <select className="input" value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
            <option value="none">Không kèm media</option>
            <option value="image">Kèm ảnh</option>
            <option value="video">Kèm video</option>
          </select>
          {mediaType !== "none" && (
            <>
              <select className="input mt-2" value={articleId} onChange={(e) => setArticleId(e.target.value)}>
                <option value="">— Chọn bài viết —</option>
                {(recent?.rows ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                    {a.visibility === "members" ? " (chỉ thành viên — sẽ gửi kèm link)" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">
                Ảnh &gt; 10MB hoặc video &gt; 50MB sẽ không gửi được file — hãy dùng ảnh bìa kèm link.
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
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div>
          <label className="label">Lịch gửi</label>
          <select className="input" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
            <option value="now">Gửi ngay</option>
            <option value="daily">Hằng ngày</option>
            <option value="weekly">Hằng tuần</option>
          </select>
        </div>
        <div>
          <label className="label">Giờ (VN)</label>
          <input type="number" min={0} max={23} className="input" value={hour} onChange={(e) => setHour(Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Phút</label>
          <input type="number" min={0} max={59} className="input" value={minute} onChange={(e) => setMinute(Number(e.target.value))} />
        </div>
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

      <button className="btn-primary" disabled={busy} onClick={() => void submit()}>
        {busy ? "Đang lưu..." : "Lưu chiến dịch"}
      </button>
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

  async function submit() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await api<{ imported: number }>("/api/admin/telegram/import-ids", { body: { content } });
      setMsg(`Đã nhập ${res.imported} Telegram id.`);
      setContent("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
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
  );
}
