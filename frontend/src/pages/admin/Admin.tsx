import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "../../api";
import { isStaff, useAuth } from "../../auth";
import { Avatar, ErrorBox, Pagination, Spinner, Tabs, UserLink } from "../../components/ui";
import { formatDate, formatNumber } from "../../format";
import { useFetch } from "../../useFetch";
import type { Category, Channel, Profile } from "../../types";
import AdminArticles from "./AdminArticles";
import AdminReports from "./AdminReports";
import AdminSettings from "./AdminSettings";
import AdminSupport from "./AdminSupport";
import {
  AdminTelegramCampaigns,
  AdminTelegramOverview,
  AdminTelegramUsers,
} from "./AdminTelegram";
import {
  AdminTelegramBotsManage,
  AdminTelegramIdsManage,
  AdminTelegramKeyboard,
  AdminTelegramSlogans,
  AdminTelegramTemplates,
} from "./AdminTelegramTools";
import { AdminSystem } from "./AdminSystem";

const TABS = ["overview", "reports", "bai-viet", "users", "categories", "channels", "support", "telegram", "settings", "system"] as const;
type Tab = (typeof TABS)[number];

function Overview() {
  const { user } = useAuth();
  const { data, error } = useFetch<Record<string, number>>("/api/admin/overview");
  const [msg, setMsg] = useState<string | null>(null);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;
  const items = [
    ["Thành viên", data.members],
    ["Thành viên mới 24h", data.newMembers24h],
    ["Chủ đề", data.threads],
    ["Bài viết", data.posts],
    ["Bài viết media", data.articles],
    ["Tin nhắn chat", data.chatMessages],
    ["CSKH đang mở", data.openSupport],
    ["Báo vi phạm chờ xử lý", data.openReports],
  ] as const;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map(([k, v]) => (
          <div key={k} className="panel p-4">
            <div className="text-2xl font-black">{formatNumber(v)}</div>
            <div className="text-xs text-muted">{k}</div>
          </div>
        ))}
      </div>
      {user?.role === "admin" && (
        <div className="panel flex flex-wrap items-center gap-3 p-4">
          <div className="flex-1 text-sm text-muted">Tính lại toàn bộ bộ đếm (số bài, lượt thích, số chủ đề) nếu thấy số liệu lệch.</div>
          <button
            className="btn-ghost"
            onClick={async () => {
              setMsg(null);
              try {
                await api("/api/admin/recount", { method: "POST" });
                setMsg("Đã tính lại bộ đếm.");
              } catch (e) {
                setMsg(errorMessage(e));
              }
            }}
          >
            Tính lại bộ đếm
          </button>
          {msg && <div className="w-full text-sm text-emerald-300">{msg}</div>}
        </div>
      )}
    </div>
  );
}

function Users() {
  const { user: me } = useAuth();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useFetch<{ users: Profile[]; page: number; totalPages: number }>(
    `/api/admin/users?page=${page}&q=${encodeURIComponent(search)}`,
  );
  const [err, setErr] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  function ban(u: Profile) {
    const reason = prompt(`Lý do khoá ${u.username}:`);
    if (!reason) return;
    const daysText = prompt("Khoá bao nhiêu ngày? (để trống = vĩnh viễn)", "7");
    if (daysText === null) return;
    const days = daysText.trim() ? Number(daysText) : null;
    if (days !== null && (!Number.isInteger(days) || days < 1)) {
      setErr("Số ngày không hợp lệ.");
      return;
    }
    void act(() => api(`/api/admin/users/${u.id}/ban`, { body: { reason, days } }));
  }

  function resetPassword(u: Profile) {
    const password = prompt(`Mật khẩu mới cho ${u.username} (ít nhất 6 ký tự). Thành viên sẽ bị đăng xuất khỏi mọi thiết bị:`);
    if (!password) return;
    void act(async () => {
      await api(`/api/admin/users/${u.id}/password`, { body: { password } });
      alert(`Đã đặt lại mật khẩu cho ${u.username}. Hãy gửi mật khẩu mới cho thành viên qua CSKH.`);
    });
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setPage(1);
          setSearch(q.trim());
        }}
        className="flex gap-2"
      >
        <input className="input max-w-xs" placeholder="Tìm theo tên..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-ghost">Tìm</button>
      </form>
      <ErrorBox message={err} />
      <section className="panel overflow-x-auto">
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <ErrorBox message={error} />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted uppercase">
              <tr className="border-b border-line">
                <th className="px-4 py-2">Thành viên</th>
                <th className="px-4 py-2">Quyền</th>
                <th className="px-4 py-2">Bài</th>
                <th className="px-4 py-2">Tham gia</th>
                <th className="px-4 py-2">Trạng thái</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar user={u} size={28} />
                      <UserLink user={u} />
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {me?.role === "admin" && me.id !== u.id ? (
                      <select
                        className="input w-auto py-1"
                        value={u.role}
                        onChange={(e) => act(() => api(`/api/admin/users/${u.id}/role`, { method: "PATCH", body: { role: e.target.value } }))}
                      >
                        <option value="member">Thành viên</option>
                        <option value="mod">Điều hành viên</option>
                        <option value="admin">Quản trị viên</option>
                      </select>
                    ) : (
                      u.role
                    )}
                  </td>
                  <td className="px-4 py-2">{formatNumber(u.postCount)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-2">
                    {u.isBanned ? (
                      <span className="text-red-400" title={u.banReason ?? ""}>
                        Bị khoá{u.bannedUntil ? ` đến ${new Date(u.bannedUntil).toLocaleDateString("vi-VN")}` : ""}
                      </span>
                    ) : (
                      <span className="text-emerald-400">Bình thường</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {me?.role === "admin" && u.id !== me.id && u.role !== "admin" && (
                      <button className="btn-ghost mr-2 px-3 py-1" onClick={() => resetPassword(u)}>
                        Đặt lại MK
                      </button>
                    )}
                    {u.id !== me?.id &&
                      (u.isBanned ? (
                        <button className="btn-ghost px-3 py-1" onClick={() => act(() => api(`/api/admin/users/${u.id}/unban`, { method: "POST" }))}>
                          Mở khoá
                        </button>
                      ) : (
                        u.role !== "admin" && (
                          <button className="btn-danger px-3 py-1" onClick={() => ban(u)}>
                            Khoá
                          </button>
                        )
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}

type Field = { key: string; label: string; type?: "text" | "number" | "checkbox"; width?: string };

function CrudList<T extends { id: number }>({
  endpoint,
  listKey,
  fields,
  blank,
  canEdit,
}: {
  endpoint: string;
  listKey: string;
  fields: Field[];
  blank: Record<string, unknown>;
  canEdit: boolean;
}) {
  const { data, error, reload } = useFetch<Record<string, T[]>>(endpoint);
  const [draft, setDraft] = useState<Record<string, unknown>>(blank);
  const [edits, setEdits] = useState<Record<number, Record<string, unknown>>>({});
  const [err, setErr] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await fn();
      reload();
      return true;
    } catch (e) {
      setErr(errorMessage(e));
      return false;
    }
  }

  const input = (f: Field, value: unknown, onChange: (v: unknown) => void) =>
    f.type === "checkbox" ? (
      <input type="checkbox" checked={!!value} disabled={!canEdit} onChange={(e) => onChange(e.target.checked)} />
    ) : (
      <input
        className={`input py-1 ${f.width ?? ""}`}
        type={f.type === "number" ? "number" : "text"}
        value={String(value ?? "")}
        disabled={!canEdit}
        onChange={(e) => onChange(f.type === "number" ? Number(e.target.value) : e.target.value)}
      />
    );

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;
  const rows = data[listKey] ?? [];

  return (
    <div className="space-y-3">
      <ErrorBox message={err} />
      {!canEdit && <div className="text-sm text-muted">Chỉ quản trị viên được chỉnh sửa mục này.</div>}
      <section className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted uppercase">
            <tr className="border-b border-line">
              {fields.map((f) => (
                <th key={f.key} className="px-3 py-2">
                  {f.label}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const edit = edits[row.id] ?? {};
              const get = (k: string) => (k in edit ? edit[k] : (row as Record<string, unknown>)[k]);
              return (
                <tr key={row.id}>
                  {fields.map((f) => (
                    <td key={f.key} className="px-3 py-2">
                      {input(f, get(f.key), (v) => setEdits((all) => ({ ...all, [row.id]: { ...edit, [f.key]: v } })))}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {canEdit && (
                      <>
                        <button
                          className="btn-ghost mr-2 px-3 py-1"
                          disabled={!Object.keys(edit).length}
                          onClick={async () => {
                            if (await act(() => api(`${endpoint}/${row.id}`, { method: "PATCH", body: edit }))) {
                              setEdits((all) => ({ ...all, [row.id]: {} }));
                            }
                          }}
                        >
                          Lưu
                        </button>
                        <button
                          className="btn-danger px-3 py-1"
                          onClick={() => confirm("Xoá mục này?") && act(() => api(`${endpoint}/${row.id}`, { method: "DELETE" }))}
                        >
                          Xoá
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {canEdit && (
              <tr className="bg-panel-2/40">
                {fields.map((f) => (
                  <td key={f.key} className="px-3 py-2">
                    {input(f, draft[f.key], (v) => setDraft((d) => ({ ...d, [f.key]: v })))}
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  <button
                    className="btn-primary px-3 py-1"
                    onClick={async () => {
                      if (await act(() => api(endpoint, { body: draft }))) setDraft(blank);
                    }}
                  >
                    Thêm
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default function Admin() {
  const { user, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t === params.get("tab")) ?? "overview";
  const setTab = (t: Tab) => setParams(t === "overview" ? {} : { tab: t });
  if (loading) return <Spinner />;
  if (!isStaff(user)) {
    return (
      <div className="panel p-10 text-center">
        <p className="text-muted">Bạn không có quyền vào trang này.</p>
        <Link to="/" className="btn-primary mt-4">
          Về trang chủ
        </Link>
      </div>
    );
  }
  const admin = user?.role === "admin";
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Quản trị</h1>
      <Tabs
        tabs={[
          { id: "overview", label: "Tổng quan" },
          { id: "reports", label: "Báo vi phạm" },
          { id: "bai-viet", label: "Bài viết" },
          { id: "users", label: "Thành viên" },
          { id: "categories", label: "Chuyên mục" },
          { id: "channels", label: "Kênh chat" },
          { id: "support", label: "CSKH" },
          ...(admin ? [{ id: "telegram" as const, label: "Telegram" }] : []),
          ...(admin ? [{ id: "settings" as const, label: "Cài đặt trang" }] : []),
          ...(admin ? [{ id: "system" as const, label: "Hệ thống" }] : []),
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "overview" && <Overview />}
      {tab === "reports" && <AdminReports />}
      {tab === "settings" && admin && <AdminSettings />}
      {tab === "bai-viet" && <AdminArticles />}
      {tab === "users" && <Users />}
      {tab === "categories" && (
        <CrudList<Category>
          endpoint="/api/admin/categories"
          listKey="categories"
          canEdit={admin}
          blank={{ slug: "", title: "", description: "", icon: "💬", sortOrder: 0, staffOnly: false }}
          fields={[
            { key: "icon", label: "Biểu tượng", width: "w-16" },
            { key: "title", label: "Tên" },
            { key: "slug", label: "Đường dẫn" },
            { key: "description", label: "Mô tả" },
            { key: "sortOrder", label: "Thứ tự", type: "number", width: "w-20" },
            { key: "staffOnly", label: "Chỉ BQT đăng", type: "checkbox" },
          ]}
        />
      )}
      {tab === "channels" && (
        <CrudList<Channel>
          endpoint="/api/admin/channels"
          listKey="channels"
          canEdit={admin}
          blank={{ slug: "", name: "", description: "", sortOrder: 0, staffOnly: false }}
          fields={[
            { key: "name", label: "Tên kênh" },
            { key: "slug", label: "Đường dẫn" },
            { key: "description", label: "Mô tả" },
            { key: "sortOrder", label: "Thứ tự", type: "number", width: "w-20" },
            { key: "staffOnly", label: "Chỉ BQT nhắn", type: "checkbox" },
          ]}
        />
      )}
      {tab === "support" && <AdminSupport />}
      {tab === "telegram" && admin && <AdminTelegram />}
      {tab === "system" && admin && <AdminSystem />}
    </div>
  );
}

const TG_TABS = [
  "tong-quan",
  "chien-dich",
  "nguoi-dung",
  "bot",
  "ban-phim",
  "mau-tin-nhan",
  "cau-hinh",
  "nhap-id",
] as const;

function AdminTelegram() {
  const [sub, setSub] = useState<(typeof TG_TABS)[number]>("tong-quan");
  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { id: "tong-quan", label: "Tổng quan" },
          { id: "chien-dich", label: "Chiến dịch" },
          { id: "nguoi-dung", label: "Người Telegram" },
          { id: "bot", label: "Bot" },
          { id: "ban-phim", label: "Bàn phím" },
          { id: "mau-tin-nhan", label: "Mẫu tin nhắn" },
          { id: "cau-hinh", label: "Cấu hình" },
          { id: "nhap-id", label: "Nhập ID" },
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === "tong-quan" && <AdminTelegramOverview />}
      {sub === "chien-dich" && <AdminTelegramCampaigns />}
      {sub === "nguoi-dung" && <AdminTelegramUsers />}
      {sub === "bot" && <AdminTelegramBotsManage />}
      {sub === "ban-phim" && <AdminTelegramKeyboard />}
      {sub === "mau-tin-nhan" && <AdminTelegramTemplates />}
      {sub === "cau-hinh" && <AdminTelegramSlogans />}
      {sub === "nhap-id" && <AdminTelegramIdsManage />}
    </div>
  );
}
