import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api";
import { ErrorBox, Spinner } from "../../components/ui";
import { formatNumber } from "../../format";
import { useFetch } from "../../useFetch";
import type {
  TelegramBotIncident,
  TelegramBotStat,
  TelegramGreeting,
  TelegramGreetingButton,
  TelegramGreetingItem,
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
 * Greeting — the message the bot sends when somebody presses /start
 * ------------------------------------------------------------------ */

/** The placeholders the admin may use in a greeting. */
const greetingPlaceholders = [
  { token: "{{name}}", hint: "Tên người dùng (có thể để trống)" },
  { token: "{{link}}", hint: "Đường dẫn của câu chào này" },
];

/** The buttons the bot offers out of the box. */
const standardGreetingButtons = [
  { label: "🌐 Mở Website", url: "" },
  { label: "👑 Kênh VIP", url: "" },
  { label: "🔥 Bài mới", url: "" },
  { label: "💬 CSKH", url: "" },
];

/** One article the admin can link a greeting to. */
interface GreetingArticle {
  id: number;
  title: string;
  visibility?: string;
  media: { kind: string; key: string; ext?: string }[];
}

/**
 * The editor of one greeting.
 *
 * Every greeting can carry its own media, its own buttons and its own link,
 * so the admin decides what the message leads to.
 */
function GreetingEditor({
  index,
  item,
  onChange,
  onRemove,
}: {
  index: number;
  item: TelegramGreetingItem;
  onChange: (patch: Partial<TelegramGreetingItem>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [articles, setArticles] = useState<GreetingArticle[]>([]);

  // The list of articles is only needed when the admin picks a link.
  useEffect(() => {
    if (!open || articles.length) return;
    let alive = true;
    fetch("/api/admin/telegram/articles/recent?hours=720", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data: { rows?: { id: number; title: string; visibility?: string; media: { kind: string; key: string; ext?: string }[] }[] }) => {
        if (!alive) return;
        setArticles(data.rows ?? []);
      })
      .catch(() => {
        if (alive) setArticles([]);
      });
    return () => {
      alive = false;
    };
  }, [open, articles.length]);

  const media = item.media ?? { type: "none" as const, key: null, source: null };

  /** Upload a file and use it as the media of this greeting. */
  async function upload(file: File) {
    setBusy(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/telegram/settings/greeting/media", {
        method: "POST",
        body,
        credentials: "include",
        headers: { "x-requested-with": "ctc" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Không tải lên được.");
      onChange({
        media: {
          type: data.type,
          key: data.key,
          source: "upload",
        },
      });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Không tải lên được.");
    } finally {
      setBusy(false);
    }
  }

  function setButton(indexOfButton: number, patch: Partial<TelegramGreetingButton>) {
    const buttons = (item.buttons ?? []).map((button, i) => (i === indexOfButton ? { ...button, ...patch } : button));
    onChange({ buttons });
  }

  return (
    <div className="panel space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">Câu chào {index + 1}</h3>
        <div className="flex gap-2">
          <button type="button" className="btn btn-sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Ẩn tuỳ chọn" : "⚙️ Ảnh, nút & link"}
          </button>
          <button type="button" className="btn btn-sm btn-danger" onClick={onRemove}>
            Xoá
          </button>
        </div>
      </div>

      <textarea
        className="input w-full font-mono text-xs"
        rows={5}
        value={item.text}
        onChange={(e) => onChange({ text: e.target.value })}
        maxLength={2000}
        placeholder="👋 Chào mừng {{name}} đến Chống Tối Cổ!"
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-semibold">Biến dùng được:</span>
        {greetingPlaceholders.map((p) => (
          <button
            key={p.token}
            type="button"
            className="btn btn-sm"
            title={p.hint}
            onClick={() => onChange({ text: `${item.text} ${p.token}` })}
          >
            {p.token}
          </button>
        ))}
        <span className="ml-auto">{item.text.length}/2000 ký tự</span>
      </div>

      {open && (
        <div className="space-y-4 border-t border-line pt-4">
          {/* ---------------- media ---------------- */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase text-muted">Ảnh / video đính kèm</h4>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`btn btn-sm ${media.type === "none" ? "btn-accent" : ""}`}
                onClick={() => onChange({ media: { type: "none", key: null, source: null } })}
              >
                Không kèm
              </button>
              <button
                type="button"
                className={`btn btn-sm ${media.type === "image" ? "btn-accent" : ""}`}
                onClick={() => onChange({ media: { type: "image", key: media.key, source: media.source } })}
              >
                🖼️ Ảnh
              </button>
              <button
                type="button"
                className={`btn btn-sm ${media.type === "video" ? "btn-accent" : ""}`}
                onClick={() => onChange({ media: { type: "video", key: media.key, source: media.source } })}
              >
                🎬 Video
              </button>
            </div>

            {media.type !== "none" && (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted">
                    Tải file mới lên (ảnh jpg/png/webp, video mp4/webm/mov)
                  </span>
                  <input
                    className="input w-full"
                    type="file"
                    accept={media.type === "video" ? "video/mp4,video/webm,video/quicktime" : "image/*"}
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {busy && <p className="text-xs text-muted">Đang tải lên…</p>}
                {uploadError && <p className="text-xs text-rose-300">{uploadError}</p>}

                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted">Hoặc chọn file có sẵn trong bài viết</span>
                  <select
                    className="input w-full"
                    value={media.key ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (!value) {
                        onChange({ media: { type: media.type, key: null, source: null } });
                        return;
                      }
                      onChange({ media: { type: media.type, key: value, source: "article" } });
                    }}
                  >
                    <option value="">— Chọn file —</option>
                    {greetingMediaOptions(media.type, articles).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {media.key && (
                  <p className="text-xs text-muted">
                    Đã chọn: <b className="font-mono">{media.key}</b>
                    {media.source === "upload" ? " (file tải lên)" : " (file của bài viết)"}
                  </p>
                )}
                <p className="text-xs text-muted">
                  File của bài "chỉ thành viên" sẽ không được gửi đi — hãy dùng file công khai.
                </p>
              </>
            )}
          </div>

          {/* ---------------- link ---------------- */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase text-muted">Link của câu chào này</h4>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted">Chọn bài viết (biến {"{{link}}"} sẽ trỏ tới bài này)</span>
              <select
                className="input w-full"
                value={item.link?.articleId ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  onChange({
                    link: {
                      articleId: value ? Number(value) : null,
                      url: value ? null : (item.link?.url ?? null),
                    },
                  });
                }}
              >
                <option value="">— Không chọn bài (dùng link bên dưới) —</option>
                {articles.map((article) => (
                  <option key={article.id} value={article.id}>
                    {article.title}
                    {article.visibility === "members" ? " (chỉ thành viên)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted">Hoặc tự nhập địa chỉ</span>
              <input
                className="input w-full"
                value={item.link?.url ?? ""}
                onChange={(e) =>
                  onChange({
                    link: { articleId: null, url: e.target.value || null },
                  })
                }
                maxLength={500}
                placeholder="https://t.me/kenvip"
              />
            </label>
            <p className="text-xs text-muted">
              Nếu không chọn gì, biến {"{{link}}"} sẽ trỏ tới trang chủ của website (có gắn mã đo lượt truy cập).
            </p>
          </div>

          {/* ---------------- buttons ---------------- */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase text-muted">Nút bấm của câu chào này</h4>
            <div className="flex flex-wrap gap-2">
              {standardGreetingButtons.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className="btn btn-sm"
                  onClick={() =>
                    onChange({
                      buttons: [...(item.buttons ?? []), { label: preset.label, url: preset.url }],
                    })
                  }
                >
                  + {preset.label}
                </button>
              ))}
            </div>

            {(item.buttons ?? []).length === 0 ? (
              <p className="text-xs text-muted">Chưa có nút nào. Bấm vào các nút mẫu ở trên để thêm.</p>
            ) : (
              <div className="space-y-2">
                {(item.buttons ?? []).map((button, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <input
                      className="input w-44"
                      value={button.label}
                      onChange={(e) => setButton(i, { label: e.target.value })}
                      maxLength={64}
                      placeholder="Nhãn nút"
                    />
                    <input
                      className="input flex-1"
                      value={button.url}
                      onChange={(e) => setButton(i, { url: e.target.value })}
                      maxLength={500}
                      placeholder="https://..."
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() =>
                        onChange({ buttons: (item.buttons ?? []).filter((_, bi) => bi !== i) })
                      }
                    >
                      Xoá
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The files of the recent articles, ready to be picked. */
function greetingMediaOptions(
  kind: "image" | "video",
  rows: { id: number; title: string; visibility?: string; media: { kind: string; key: string; ext?: string }[] }[],
): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (const row of rows) {
    for (const file of row.media ?? []) {
      if (file.kind !== kind) continue;
      const value = kind === "video" ? `video:${file.key}.${file.ext ?? "mp4"}` : `image:${file.key}`;
      const lock = row.visibility === "members" ? " 🔒" : "";
      options.push({ value, label: `${row.title} — ${file.key}${lock}` });
    }
  }
  return options;
}

export function AdminTelegramGreeting() {
  const { data, error, reload } = useFetch<{ greeting: TelegramGreeting }>("/api/admin/telegram/settings");
  const [greeting, setGreeting] = useState<TelegramGreeting | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.greeting) setGreeting(data.greeting);
  }, [data]);

  async function save(next: TelegramGreeting) {
    setBusy(true);
    setNotice(null);
    try {
      await api("/api/admin/telegram/settings/greeting", { method: "PUT", body: next });
      setNotice({ tone: "ok", message: "Đã lưu lời chào." });
      reload();
    } catch (e) {
      setNotice({ tone: "err", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (!data || !greeting) return <Spinner />;

  function updateItem(index: number, patch: Partial<TelegramGreetingItem>) {
    setGreeting((prev) =>
      prev
        ? { ...prev, items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) }
        : prev,
    );
  }

  function addItem() {
    const next: TelegramGreeting = {
      ...greeting!,
      items: [
        ...greeting!.items,
        {
          id: `g${Date.now()}`,
          text: "👋 Chào mừng {{name}} đến Chống Tối Cổ!\n\n{{link}}",
          media: { type: "none", key: null, source: null },
          buttons: [],
          link: { articleId: null, url: null },
        },
      ],
    };
    setGreeting(next);
    void save(next);
  }

  function removeItem(index: number) {
    const next: TelegramGreeting = { ...greeting!, items: greeting!.items.filter((_, i) => i !== index) };
    setGreeting(next);
    void save(next);
  }

  return (
    <div className="space-y-4">
      <div className="panel p-4 text-sm text-muted">
        Lời chào được bot gửi khi người dùng bấm <b>/start</b>. Viết nhiều câu thì bot sẽ <b>chọn ngẫu nhiên</b> một
        câu mỗi lần, nên mỗi người thấy lời chào khác nhau. Mỗi câu chào có thể có <b>ảnh/video riêng</b>, <b>nút bấm
        riêng</b> và <b>link riêng</b>. Nội dung hỗ trợ HTML (xuống dòng, in đậm, in nghiêng, link) và hai biến{" "}
        <b>{"{{name}}"}</b> (tên người dùng) và <b>{"{{link}}"}</b> (link của câu chào này).
      </div>
      {notice && <Notice tone={notice.tone} message={notice.message} />}

      <div className="panel space-y-3 p-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={greeting.enabled}
            onChange={(e) => setGreeting({ ...greeting, enabled: e.target.checked })}
          />
          <span>Bật lời chào</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={greeting.keepButtons}
            onChange={(e) => setGreeting({ ...greeting, keepButtons: e.target.checked })}
          />
          <span>Giữ nút bấm mặc định của bot (Mở website, Nhận thông báo…)</span>
        </label>
      </div>

      {greeting.items.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted">
          Chưa có câu chào nào. Bấm <b>+ Thêm lời chào</b> để bắt đầu.
        </div>
      ) : (
        greeting.items.map((item, index) => (
          <GreetingEditor
            key={item.id || index}
            index={index}
            item={item}
            onChange={(patch) => updateItem(index, patch)}
            onRemove={() => removeItem(index)}
          />
        ))
      )}

      <div className="flex gap-2">
        <button type="button" className="btn" onClick={addItem}>
          + Thêm lời chào
        </button>
        <button type="button" className="btn btn-accent" disabled={busy} onClick={() => save(greeting)}>
          {busy ? "Đang lưu…" : "Lưu lời chào"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Imported ids
 * ------------------------------------------------------------------ */

export function AdminTelegramIdsManage() {
  const stats = useFetch<{ stats: Record<string, number> }>("/api/admin/telegram/ids/stats");
  // The imported ids grouped by their status, so the admin can pick a group
  // as the target of a campaign (the emergency scan uses this list).
  const groups = useFetch<{
    groups: { status: string; count: number; label: string }[];
    total: number;
  }>("/api/admin/telegram/ids/groups");
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
      groups.reload();
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

  async function cleanupJobs() {
    if (!window.confirm("Bỏ khỏi hàng đợi các job gửi tới ID không hợp lệ hoặc đã bị chặn?")) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await api<{ removed: number }>("/api/admin/telegram/ids/cleanup", { method: "POST" });
      setNotice({ tone: "ok", message: `Đã dọn ${res.removed} job không thể gửi.` });
      groups.reload();
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

      {groups.data && groups.data.groups.length > 0 && (
        <div className="panel space-y-3 p-4">
          <h2 className="font-black">Phân loại ID ({formatNumber(groups.data.total)} id)</h2>
          <p className="text-sm text-muted">
            Trạng thái được cập nhật tự động khi chiến dịch gửi tới: Telegram báo lỗi thì id đó chuyển sang nhóm
            tương ứng. Lần quét đầu tiên hãy dùng <b>⚡ Gửi khẩn cấp</b> cho toàn bộ id, các lần sau chỉ gửi nhóm{" "}
            <b>Hoạt động</b>.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {groups.data.groups.map((g) => (
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
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={cleanupJobs}
          >
            🧹 Dọn job của ID không dùng được
          </button>
          <p className="text-xs text-muted">
            Bỏ khỏi hàng đợi những công việc gửi tới các id đã biết là không hợp lệ hoặc đã bị chặn — việc đó không
            thể gửi được nữa.
          </p>
        </div>
      )}
    </div>
  );
}
