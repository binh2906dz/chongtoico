export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail;
    const message = typeof detail === "string" ? detail : res.status === 422 ? "Dữ liệu không hợp lệ" : `Lỗi ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export type Admin = { id: number; username: string; role: "owner" | "manager" };

export type BotItem = {
  id: number;
  telegram_id: number;
  username: string;
  name: string;
  token_hint: string;
  is_active: boolean;
  running: boolean;
  subscribers: number;
  created_at: string;
};

export type Stats = {
  bots_total: number;
  bots_active: number;
  bots_running: number;
  users_total: number;
  subscriptions_active: number;
  subscriptions_blocked: number;
};
