/**
 * A quick check of the new management endpoints.
 * It logs in as the admin and calls every new endpoint once.
 */
const BASE = "http://127.0.0.1:8090";
const H = { "content-type": "application/json", "x-requested-with": "ctc" };

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ username: "admin", password: "admin123456" }),
});
console.log("login:", login.status);
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
const auth = { "x-requested-with": "ctc", cookie };

async function call(method, url, body) {
  const headers = { ...auth };
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = text;
  try {
    parsed = JSON.stringify(JSON.parse(text)).slice(0, 320);
  } catch {}
  console.log(`${method} ${url} -> ${res.status} ${parsed}`);
  return { status: res.status, body: text };
}

await call("GET", "/api/admin/telegram/bots/list");
await call("GET", "/api/admin/telegram/bots/stats");
await call("GET", "/api/admin/telegram/settings");
await call("PUT", "/api/admin/telegram/settings/keyboard", {
  enabled: true,
  prompt: "👇 Chọn một tùy chọn",
  rows: [
    [
      { label: "🌐 Mở Website", type: "open_site" },
      { label: "🔕 Từ chối nhận", type: "text", body: "Bạn đã từ chối nhận." },
    ],
  ],
});
await call("PUT", "/api/admin/telegram/settings/templates", [{ title: "Bài mới", text: "🔥 Có bài mới hôm nay" }]);
await call("PUT", "/api/admin/telegram/settings/slogans", { enabled: true, items: [{ text: "👋 Chào bạn", delayAfter: 1 }] });
await call("PUT", "/api/admin/telegram/settings/schedule", { enabled: true, hour: 9, minute: 30 });
await call("GET", "/api/admin/telegram/settings");
await call("POST", "/api/admin/telegram/ids/import", {
  content: "Alpha,111222333\nBeta,444555666\nGamma,777888999",
  filename: "demo.csv",
});
await call("GET", "/api/admin/telegram/ids/stats");
await call("GET", "/api/admin/telegram/campaigns/summary");
await call("GET", "/api/admin/system/info");
await call("POST", "/api/admin/system/backup");
await call("POST", "/api/admin/system/backup/nope.sql/restore");

// The bot service must refuse a call without the shared secret.
const noSecret = await fetch(`${BASE}/api/bot/settings`);
console.log("GET /api/bot/settings without secret ->", noSecret.status);
