import path from "node:path";

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
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
  trustProxy: bool(process.env.TRUST_PROXY, true),
  adminUsername: process.env.ADMIN_USERNAME || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  sessionDays: 30,
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 15),
  maxVideoMb: Number(process.env.MAX_VIDEO_MB || 2048),
  logLevel: process.env.LOG_LEVEL || "info",
};

export type Config = typeof config;
