export function timeAgo(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diff = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} ngày trước`;
  return date.toLocaleDateString("vi-VN");
}

export const formatDate = (value: string) =>
  new Date(value).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

export const formatNumber = (n: number) => n.toLocaleString("vi-VN");

export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(".0", "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(".0", "")}K`;
  return String(n);
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

/** Size variants served by /media: `s` ≈ 480px wide, `m` ≈ 1280px (albums), `t` = album thumbnail. */
export const imageVariant = (url: string, variant: "s" | "m" | "t") => url.replace(/(_[tsm])?\.webp$/, `_${variant}.webp`);

export const isNew = (createdAt: string, hours = 48) => Date.now() - new Date(createdAt).getTime() < hours * 3600_000;

export const roleLabel: Record<string, string> = { admin: "Quản trị viên", mod: "Điều hành viên", member: "Thành viên" };
