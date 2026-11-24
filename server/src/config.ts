import path from "node:path";

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

// Only the reverse proxy may set X-Forwarded-For. Nginx on the host reaches the
// container through the Docker bridge, so private ranges are trusted, never "all".
const DEFAULT_TRUSTED_PROXIES = "127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16";

function trustProxy(value: string | undefined): string | false {
  if (value === undefined || value === "" || value.toLowerCase() === "true") return DEFAULT_TRUSTED_PROXIES;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  return value;
}

export const config = {
  siteName: process.env.SITE_NAME || "Chống Tối Cổ",
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 8090),
  // "postgres://..." in production; "pglite:<dir>" or "pglite:memory" for local runs and tests.
  databaseUrl: process.env.DATABASE_URL || "pglite:./data/pglite",
  uploadDir: path.resolve(process.env.UPLOAD_DIR || "./data/uploads"),
  publicDir: path.resolve(process.env.PUBLIC_DIR || "../frontend/dist"),
  cookieSecure: bool(process.env.COOKIE_SECURE, false),
  trustProxy: trustProxy(process.env.TRUST_PROXY),
  adminUsername: process.env.ADMIN_USERNAME || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  sessionDays: 30,
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 15),
  maxVideoMb: Number(process.env.MAX_VIDEO_MB || 2048),
  logLevel: process.env.LOG_LEVEL || "info",
  /** Shared secret between the web app and the Telegram bot service (X-Bot-Secret). */
  botApiSecret: process.env.BOT_API_SECRET || "",
  /** Internal URL of the bot service, used only to verify Telegram initData. */
  botInternalUrl: process.env.BOT_INTERNAL_URL || "http://127.0.0.1:8091",
  /** Public base URL of the site, used to build links inside Telegram messages. */
  siteUrl: (process.env.SITE_URL || "http://127.0.0.1:8090").replace(/\/+$/, ""),
};

export type Config = typeof config;
