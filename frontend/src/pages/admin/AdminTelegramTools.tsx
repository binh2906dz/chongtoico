import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api";
import { ErrorBox, Spinner } from "../../components/ui";
import { formatNumber } from "../../format";
import { useFetch } from "../../useFetch";
import type {
  TelegramBotIncident,
  TelegramBotStat,
  TelegramKeyboard,
  TelegramKeyboardCell,
  TelegramManagedBot,
  TelegramSchedule,
  TelegramSlogans,
  TelegramTemplate,
} from "../../types";

/* ------------------------------------------------------------------ *
 * Shared bits
 * ------------------------------------------------------------------ */

/** A small banner used to report the result of an action. */
function Notice({ tone, message }: { tone: "ok" | "err"; message: string }) {
  return (
    <div
      className={
        tone === "ok"
          ? "rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
          : "rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
      }
    >
      {message}
    </div>
  );
}

/** The label of every kind of keyboard button. */
const cellTypeLabel: Record<TelegramKeyboardCell["type"], string> = {
  text: "Trả lời cố định",
  url: "Mở liên kết",
  webapp: "Mở Mini App",
  open_site: "Mở website",
  remove_keyboard: "Ẩn bàn phím",
  stats: "Thống kê bot",
};

/* ------------------------------------------------------------------ *
 * Bots — the management part
 * ------------------------------------------------------------------ */

export function AdminTelegramBotsManage() {
  const { data, error, reload } = useFetch<{ bots: TelegramManagedBot[]; storageEnabled: boolean }>(
    "/api/admin/telegram/bots/list",
  );
  const stats = useFetch<{ bots: TelegramBotStat[] }>("/api/admin/telegram/bots/stats");
  const incidents = useFetch<{ incidents: TelegramBotIncident[] }>("/api/admin/telegram/bots/incidents");
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; message: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [weight, setWeight] = useState(1);
  const [busy, setBusy] = useState(false);

  async function addBot() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await api<{ synced: boolean }>("/api/admin/telegram/bots/add", {
        method: "POST",
        body: { name: name.trim(), token: token.trim(), weight },
      });
      setNotice({
        tone: "ok",
        message: res.synced
          ? "Đã thêm bot và đồng bộ sang dịch vụ bot."
          : "Đã lưu bot, nhưng dịch vụ bot chưa nhận được — hãy khởi động lại dịch vụ bot.",
      });
      setName("");
      setToken("");
      setWeight(1);
      setShowAdd(false);
      reload();
    } catch (e) {
      setNotice({ tone: "err", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function removeBot(id: string, label: string) {
    if (!window.confirm(`Xoá bot "${label}"? Token của bot sẽ bị xoá khỏi cơ sở dữ liệu.`)) return;
    setNotice(null);
    try {
      await api(`/api/admin/telegram/bots/${id}/remove`, { method: "POST" });
      setNotice({ tone: "ok", message: "Đã xoá bot." });
      reload();
    } catch (e) {
      setNotice({ tone: "err", message: errorMessage(e) });
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setNotice(null);
    try {
      await api(`/api/admin/telegram/bots/${id}`, { method: "PATCH", body });
      reload();
    } catch (e) {
      setNotice({ tone: "err", message: errorMessage(e) });
    }
  }

  /** Ask Telegram about every bot — a ban must never stay unnoticed. */
  async function runHealthCheck() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await api<{ checked: number; report: { id: string; name: string; status: string; reason?: string }[] }>(
        "/api/admin/telegram/bots/health-check",
        { method: "POST", body: {} },
      );
      const banned = res.report.filter((r) => r.status === "ban");
      const broken = res.report.filter((r) => r.status === "error");
      setNotice({
        tone: banned.length ? "err" : "ok",
        message: banned.length
          ? `${banned.length} bot bị ban: ${banned.map((b) => b.name).join(", ")}. Bot đã bị ngừng dùng.`
          : broken.length
            ? `Đã kiểm tra ${res.checked} bot. ${broken.length} bot lỗi: ${broken.map((b) => b.name).join(", ")}.`
            : `Đã kiểm tra ${res.checked} bot — tất cả còn sống.`,
      });
      reload();
      incidents.reload();
    } catch (e) {
      setNotice({ tone: "err", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;

  const statFor = (id: string) => stats.data?.bots.find((b) => b.id === id);

  return (
    <div className="space-y-4">
      <div className="panel p-4 text-sm text-muted">
        Thêm bot ngay tại đây: dán token, hệ thống kiểm tra với Telegram (getMe) rồi <b>mã hoá bằng AES-256-GCM</b> và
        lưu vào cơ sở dữ liệu. Token không bao giờ hiện lại trên web, chỉ hiện dạng đã che. Trọng số quyết định tỉ lệ
        chia tin nhắn giữa các bot.
      </div>

      {!data.storageEnabled && (
        <Notice
          tone="err"
          message="Máy chủ chưa cấu hình TOKEN_ENCRYPTION_KEY nên chưa thể thêm bot từ web. Hãy đặt biến môi trường này rồi khởi động lại máy chủ."
        />
      )}
      {notice && <Notice tone={notice.tone} message={notice.message} />}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Danh sách bot</h2>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={runHealthCheck}>
            {busy ? "Đang kiểm tra…" : "🔍 Kiểm tra bot"}
          </button>
          <button
            type="button"
            className="btn btn-accent"
            disabled={!data.storageEnabled}
            onClick={() => setShowAdd((v) => !v)}
          >
            {showAdd ? "Đóng" : "+ Thêm bot"}
          </button>
        </div>
      </div>

      {/* Báo cáo bot bị ban — hệ thống tự kiểm tra mỗi ngày. */}
      {incidents.data?.incidents.length ? (
        <div className="panel overflow-hidden">
          <div className="border-b border-line bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200">
            ⚠️ Báo cáo bot bị ban ({incidents.data.incidents.length})
          </div>
          <ul className="divide-y divide-line">
            {incidents.data.incidents.slice(0, 20).map((inc) => (
              <li key={inc.id} className="px-4 py-2 text-sm">
                <div className="font-medium text-rose-200">
                  {inc.botUsername ? `@${inc.botUsername}` : inc.botId}
                </div>
                <div className="text-xs text-muted">
                  {inc.message ?? "Bot bị Telegram cấm."} · {new Date(inc.detectedAt).toLocaleString("vi-VN")}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="panel p-3 text-xs text-muted">
          ✅ Chưa có bot nào bị ban. Hệ thống tự kiểm tra mỗi ngày — nếu có bot mới bị ban, báo cáo sẽ hiện ở đây.
        </div>
      )}

      {showAdd && (
        <div className="panel space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted">Tên hiển thị</span>
              <input
                className="input w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ví dụ: Bot chính"
                maxLength={80}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted">Token bot</span>
              <input
                className="input w-full font-mono"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456789:AA..."
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted">Trọng số</span>
              <input
                className="input w-full"
                type="number"
                min={0}
                max={100}
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="text-xs text-muted">
            Token sẽ được kiểm tra với Telegram trước khi lưu. Không dán token của bot đã bị ban.
          </p>
          <button type="button" className="btn btn-accent" disabled={busy || !token.trim()} onClick={addBot}>
            {busy ? "Đang kiểm tra…" : "Kiểm tra & lưu bot"}
          </button>
        </div>
      )}

      {data.bots.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted">Chưa có bot nào trong danh sách.</div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted uppercase">
              <tr>
                <th className="p-3">Bot</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3">Token</th>
                <th className="p-3">Trọng số</th>
                <th className="p-3">Đã gửi</th>
                <th className="p-3">Lượt /start</th>
                <th className="p-3">Tương tác</th>
                <th className="p-3">Tỉ lệ thành công</th>
                <th className="p-3">Người theo dõi</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {data.bots.map((bot) => {
                const stat = statFor(bot.id);
                return (
                  <tr key={bot.id} className="border-b border-line/60 last:border-0">
                    <td className="p-3">
                      <div className="font-semibold">{bot.name}</div>
                      <div className="text-xs text-muted">
                        {bot.username ? `@${bot.username}` : bot.id}
                        {bot.telegramId ? ` · id ${bot.telegramId}` : ""}
                      </div>
                      {bot.lastError && <div className="text-xs text-rose-300">{bot.lastError}</div>}
                    </td>
                    <td className="p-3">
                      <span
                        className={
                          bot.status === "live"
                            ? "badge badge-ok"
                            : bot.status === "ban"
                              ? "badge badge-bad"
                              : "badge"
                        }
                      >
                        {bot.status === "live" ? "Hoạt động" : bot.status === "ban" ? "Bị ban" : bot.status === "error" ? "Lỗi" : "Chưa kiểm tra"}
                      </span>
                      {bot.bannedAt && (
                        <div className="mt-1 text-xs text-rose-300">Bị ban {new Date(bot.bannedAt).toLocaleString("vi-VN")}</div>
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs">{bot.hasToken ? (bot.tokenHint ?? "••••") : "Chưa có"}</td>
                    <td className="p-3">
                      <input
                        className="input w-20"
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={bot.weight}
                        onBlur={(e) => {
                          const next = Number(e.target.value);
                          if (next !== bot.weight) patch(bot.id, { weight: next });
                        }}
                      />
                    </td>
                    <td className="p-3">{formatNumber(bot.sentCount)}</td>
                    <td className="p-3">{formatNumber(bot.startsCount)}</td>
                    <td className="p-3">{formatNumber(bot.interactionsCount)}</td>
                    <td className="p-3">{stat?.successRate != null ? `${stat.successRate}%` : "—"}</td>
                    <td className="p-3">{stat ? formatNumber(stat.links) : "—"}</td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => removeBot(bot.id, bot.name)}
                      >
                        Xoá
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Reply keyboard
 * ------------------------------------------------------------------ */

export function AdminTelegramKeyboard() {
  const { data, error, reload } = useFetch<{ keyboard: TelegramKeyboard }>("/api/admin/telegram/settings");
  const [keyboard, setKeyboard] = useState<TelegramKeyboard | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.keyboard) setKeyboard(data.keyboard);
  }, [data]);

  async function save() {
    if (!keyboard) return;
    setBusy(true);
    setNotice(null);
    try {
      await api("/api/admin/telegram/settings/keyboard", { method: "PUT", body: keyboard });
      setNotice({ tone: "ok", message: "Đã lưu bàn phím Telegram." });
      reload();
    } catch (e) {
      setNotice({ tone: "err", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (!data || !keyboard) return <Spinner />;

  function updateCell(rowIndex: number, cellIndex: number, patch: Partial<TelegramKeyboardCell>) {
    setKeyboard((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((row, r) =>
        r === rowIndex
          ? row.map((cell, c) => (c === cellIndex ? { ...cell, ...patch } : cell))
          : row,
      );
      return { ...prev, rows };
    });
  }

  function removeRow(rowIndex: number) {
    setKeyboard((prev) => (prev ? { ...prev, rows: prev.rows.filter((_, i) => i !== rowIndex) } : prev));
  }

  function addRow() {
    setKeyboard((prev) => (prev ? { ...prev, rows: [...prev.rows, [{ label: "", type: "text" }]] } : prev));
  }

  return (
    <div className="space-y-4">
      <div className="panel p-4 text-sm text-muted">
        Bàn phím hiện dưới ô chat của người dùng. Dùng để họ bấm một cái là tới đúng nơi cần (mở website, xem bài mới,
        từ chối nhận) thay vì phải gõ. Mỗi hàng là một hàng nút, tối đa 4 nút.
      </div>
      {notice && <Notice tone={notice.tone} message={notice.message} />}

      <div className="panel space-y-3 p-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={keyboard.enabled} onChange={(e) => setKeyboard({ ...keyboard, enabled: e.target.checked })} />
          <span>Bật bàn phím</span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted">Lời nhắn hiện trên bàn phím</span>
          <input
            className="input w-full"
            value={keyboard.prompt}
            onChange={(e) => setKeyboard({ ...keyboard, prompt: e.target.value })}
            maxLength={500}
            placeholder="👇 Chọn một tùy chọn bên dưới"
          />
        </label>
      </div>

      {keyboard.rows.map((row, rowIndex) => (
        <div key={rowIndex} className="panel space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Hàng {rowIndex + 1}</h3>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => removeRow(rowIndex)}>
              Xoá hàng
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {row.map((cell, cellIndex) => (
              <div key={cellIndex} className="space-y-2 rounded-lg border border-line p-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-muted">Nhãn nút</span>
                    <input
                      className="input w-full"
                      value={cell.label}
                      onChange={(e) => updateCell(rowIndex, cellIndex, { label: e.target.value })}
                      maxLength={64}
                      placeholder="Mở website"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-muted">Hành động</span>
                    <select
                      className="input w-full"
                      value={cell.type}
                      onChange={(e) => updateCell(rowIndex, cellIndex, { type: e.target.value as TelegramKeyboardCell["type"] })}
                    >
                      {Object.entries(cellTypeLabel).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {cell.type === "url" && (
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-muted">Địa chỉ liên kết</span>
                    <input
                      className="input w-full"
                      value={cell.url ?? ""}
                      onChange={(e) => updateCell(rowIndex, cellIndex, { url: e.target.value })}
                      maxLength={500}
                      placeholder="https://..."
                    />
                  </label>
                )}
                {(cell.type === "text" || cell.type === "stats") && (
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-muted">Nội dung trả lời</span>
                    <textarea
                      className="input w-full"
                      rows={2}
                      value={cell.body ?? ""}
                      onChange={(e) => updateCell(rowIndex, cellIndex, { body: e.target.value })}
                      maxLength={1000}
                    />
                  </label>
                )}
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() =>
                    setKeyboard((prev) =>
                      prev
                        ? {
                            ...prev,
                            rows: prev.rows.map((r, ri) => (ri === rowIndex ? r.filter((_, ci) => ci !== cellIndex) : r)),
                          }
                        : prev,
                    )
                  }
                >
                  Xoá nút
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-sm self-start"
              onClick={() =>
                setKeyboard((prev) =>
                  prev
                    ? {
                        ...prev,
                        rows: prev.rows.map((r, ri) => (ri === rowIndex ? [...r, { label: "", type: "text" as const }] : r)),
                      }
                    : prev,
                )
              }
            >
              + Thêm nút
            </button>
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <button type="button" className="btn" onClick={addRow}>
          + Thêm hàng
        </button>
        <button type="button" className="btn btn-accent" disabled={busy} onClick={save}>
          {busy ? "Đang lưu…" : "Lưu bàn phím"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Message templates
 * ------------------------------------------------------------------ */

export function AdminTelegramTemplates() {
  const { data, error, reload } = useFetch<{ templates: TelegramTemplate[] }>("/api/admin/telegram/settings");
  const [templates, setTemplates] = useState<TelegramTemplate[] | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.templates) setTemplates(data.templates);
  }, [data]);

  async function save(next: TelegramTemplate[]) {
    setBusy(true);
    setNotice(null);
    try {
      await api("/api/admin/telegram/settings/templates", { method: "PUT", body: next });
      setNotice({ tone: "ok", message: "Đã lưu danh sách mẫu tin nhắn." });
      reload();
    } catch (e) {
      setNotice({ tone: "err", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (!data || !templates) return <Spinner />;

  function addTemplate() {
    if (!title.trim() || !text.trim()) return;
    const next = [...templates!, { id: `t${Date.now()}`, title: title.trim(), text: text.trim() }];
    setTemplates(next);
    setTitle("");
    setText("");
    void save(next);
  }

  function removeTemplate(id: string) {
    const next = templates!.filter((t) => t.id !== id);
    setTemplates(next);
    void save(next);
  }

  return (
    <div className="space-y-4">
      <div className="panel p-4 text-sm text-muted">
        Mẫu tin nhắn dựng sẵn để soạn chiến dịch nhanh hơn: lưu một câu rồi bấm để chèn vào ô nội dung. Không phải chatbot
        — chỉ là thư viện câu chào dùng lại.
      </div>
      {notice && <Notice tone={notice.tone} message={notice.message} />}

      <div className="panel space-y-3 p-4">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted">Tên mẫu</span>
          <input
            className="input w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="Bài mới hôm nay"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted">Nội dung</span>
          <textarea
            className="input w-full"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            placeholder="🔥 Bài mới hôm nay đã có, mở web xem ngay"
          />
        </label>
        <button type="button" className="btn btn-accent" disabled={busy || !title.trim() || !text.trim()} onClick={addTemplate}>
          + Thêm mẫu
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted">Chưa có mẫu tin nhắn nào.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <div key={t.id} className="panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold">{t.title}</div>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => removeTemplate(t.id)}>
                  Xoá
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{t.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Slogans and schedule
 * ------------------------------------------------------------------ */

export function AdminTelegramSlogans() {
  const { data, error, reload } = useFetch<{ slogans: TelegramSlogans; schedule: TelegramSchedule }>(
    "/api/admin/telegram/settings",
  );
  const [slogans, setSlogans] = useState<TelegramSlogans | null>(null);
  const [schedule, setSchedule] = useState<TelegramSchedule | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.slogans) setSlogans(data.slogans);
    if (data?.schedule) setSchedule(data.schedule);
  }, [data]);

  async function saveSlogans(next: TelegramSlogans) {
    setBusy(true);
    setNotice(null);
    try {
      await api("/api/admin/telegram/settings/slogans", { method: "PUT", body: next });
      setNotice({ tone: "ok", message: "Đã lưu slogan." });
      reload();
    } catch (e) {
      setNotice({ tone: "err", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule(next: TelegramSchedule) {
    setBusy(true);
    setNotice(null);
    try {
      await api("/api/admin/telegram/settings/schedule", { method: "PUT", body: next });
      setNotice({ tone: "ok", message: "Đã lưu giờ gửi tự động." });
      reload();
    } catch (e) {
      setNotice({ tone: "err", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (!data || !slogans || !schedule) return <Spinner />;

  return (
    <div className="space-y-4">
      {notice && <Notice tone={notice.tone} message={notice.message} />}

      <div className="panel space-y-3 p-4">
        <h2 className="text-lg font-bold">Giờ gửi tự động</h2>
        <p className="text-sm text-muted">
          Khoảng giờ trong ngày (giờ Việt Nam) mà chiến dịch định kỳ được gửi. Luật tần suất vẫn do máy chủ thực thi: mỗi
          người tối đa 1 tin/ngày, 3 tin/tuần, cách nhau ít nhất 6 giờ, chỉ gửi trong 08:00–22:00.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={schedule.enabled}
            onChange={(e) => setSchedule({ ...schedule, enabled: e.target.checked })}
          />
          <span>Bật gửi theo lịch</span>
        </label>
        <div className="flex items-center gap-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted">Giờ</span>
            <input
              className="input w-24"
              type="number"
              min={0}
              max={23}
              value={schedule.hour}
              onChange={(e) => setSchedule({ ...schedule, hour: Number(e.target.value) })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted">Phút</span>
            <input
              className="input w-24"
              type="number"
              min={0}
              max={59}
              value={schedule.minute}
              onChange={(e) => setSchedule({ ...schedule, minute: Number(e.target.value) })}
            />
          </label>
          <button type="button" className="btn btn-accent" disabled={busy} onClick={() => saveSchedule(schedule)}>
            Lưu lịch
          </button>
        </div>
      </div>

      <div className="panel space-y-3 p-4">
        <h2 className="text-lg font-bold">Slogan</h2>
        <p className="text-sm text-muted">Câu chào ngắn dùng kèm khi gửi cho người dùng mới.</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={slogans.enabled}
            onChange={(e) => setSlogans({ ...slogans, enabled: e.target.checked })}
          />
          <span>Bật slogan</span>
        </label>
        <div className="space-y-2">
          {slogans.items.map((item, index) => (
            <div key={index} className="flex gap-2">
              <input
                className="input flex-1"
                value={item.text}
                onChange={(e) => {
                  const items = slogans.items.map((it, i) => (i === index ? { ...it, text: e.target.value } : it));
                  setSlogans({ ...slogans, items });
                }}
                maxLength={300}
              />
              <input
                className="input w-24"
                type="number"
                min={0}
                max={30}
                value={item.delayAfter}
                onChange={(e) => {
                  const items = slogans.items.map((it, i) =>
                    i === index ? { ...it, delayAfter: Number(e.target.value) } : it,
                  );
                  setSlogans({ ...slogans, items });
                }}
                title="Giây chờ sau khi gửi"
              />
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => setSlogans({ ...slogans, items: slogans.items.filter((_, i) => i !== index) })}
              >
                Xoá
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn"
            onClick={() => setSlogans({ ...slogans, items: [...slogans.items, { text: "", delayAfter: 1 }] })}
          >
            + Thêm slogan
          </button>
          <button type="button" className="btn btn-accent" disabled={busy} onClick={() => saveSlogans(slogans)}>
            Lưu slogan
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Imported ids
 * ------------------------------------------------------------------ */

export function AdminTelegramIdsManage() {
  const stats = useFetch<{ stats: Record<string, number> }>("/api/admin/telegram/ids/stats");
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setNotice(null);
    try {
      const content = await file.text();
      const res = await api<{ imported: number; total: number }>("/api/admin/telegram/ids/import", {
        method: "POST",
        body: { content, filename: file.name },
      });
      setNotice({
        tone: "ok",
        message: `Đã nhập ${res.imported} ID mới. Tổng số ID trong danh sách: ${res.total}.`,
      });
      setFileName(file.name);
      stats.reload();
    } catch (e) {
      setNotice({ tone: "err", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!window.confirm("Xoá toàn bộ ID đã nhập chưa liên kết tài khoản web?")) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await api<{ removed: number }>("/api/admin/telegram/ids/clear", { method: "POST" });
      setNotice({ tone: "ok", message: `Đã xoá ${res.removed} ID.` });
      stats.reload();
    } catch (e) {
      setNotice({ tone: "err", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  if (stats.error) return <ErrorBox message={stats.error} />;

  const s = stats.data?.stats;

  return (
    <div className="space-y-4">
      <div className="panel p-4 text-sm text-muted">
        Nạp danh sách ID Telegram từ file <b>.txt</b> hoặc <b>.csv</b> (mỗi dòng một ID, hoặc ID nằm trong cột bất kỳ).
        Dữ liệu được dùng để gửi chiến dịch tới đúng nhóm người.
      </div>
      {notice && <Notice tone={notice.tone} message={notice.message} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Tổng", s?.total ?? 0],
          ["Hoạt động", s?.active ?? 0],
          ["Chưa rõ", s?.unknown ?? 0],
          ["Bị chặn", s?.blocked ?? 0],
          ["Từ chối nhận", s?.opted_out ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="panel p-4">
            <div className="text-2xl font-black">{formatNumber(value as number)}</div>
            <div className="text-xs text-muted">{label}</div>
          </div>
        ))}
      </div>

      <div className="panel space-y-3 p-4">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted">Chọn file .txt / .csv</span>
          <input
            type="file"
            accept=".txt,.csv,text/plain,text/csv"
            className="input w-full"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
        </label>
        {fileName && <p className="text-xs text-muted">File vừa nạp: {fileName}</p>}
        <button type="button" className="btn btn-danger" disabled={busy} onClick={clearAll}>
          Xoá các ID chưa liên kết
        </button>
      </div>
    </div>
  );
}
