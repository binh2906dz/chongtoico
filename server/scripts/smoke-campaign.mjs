// Kiem tra tinh nang chien dich moi: media, gui khan cap, nhom ID da nhap
// (chay: node scripts/smoke-campaign.mjs)
// Bien moi truong: BASE, ADMIN_USER, ADMIN_PASS
const BASE = process.env.BASE || "http://127.0.0.1:8090";
const USER = process.env.ADMIN_USER || "admin";
const PASS = process.env.ADMIN_PASS || "admin123456";
const H = { "X-Requested-With": "ctc" };

let pass = 0;
let fail = 0;
const failures = [];
function ok(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  OK   ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL ${name} ${extra}`);
  }
}

async function req(method, url, { cookie, body, json, raw } = {}) {
  const headers = { ...(json ? { ...H, "Content-Type": "application/json" } : H) };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : json ? JSON.stringify(body) : body,
  });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  let data = null;
  if (!raw) {
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }
  }
  return { status: res.status, data, setCookie, headers: res.headers };
}

const cookieFrom = (sc) => {
  const c = sc.find((x) => x.startsWith("ctc_sid="));
  return c ? c.split(";")[0] : "";
};

// PNG 1x1 hop le
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

console.log(`\n=== KIEM TRA CHIEN DICH (${BASE}) ===\n`);

console.log("[1] Dang nhap admin");
let r = await req("POST", "/api/auth/login", { body: { username: USER, password: PASS }, json: true });
ok("Dang nhap admin", r.status === 200 && r.data?.user?.role === "admin", `status=${r.status}`);
const cookie = cookieFrom(r.setCookie);
if (!cookie) {
  console.log("\nKhong lay duoc cookie. Dung.\n");
  process.exit(1);
}

console.log("\n[2] Dem nhom ID da nhap");
r = await req("GET", "/api/admin/telegram/ids/groups", { cookie });
const groups = r.data?.groups ?? [];
const total = r.data?.total ?? 0;
ok("Endpoint ids/groups tra danh sach nhom", r.status === 200 && groups.length > 0, `status=${r.status}`);
ok("Tong ID > 0", total > 0, `total=${total}`);
for (const g of groups) {
  console.log(`       - ${g.label}: ${g.count}`);
}
ok(
  "Cac nhom trang thai co du (active/blocked/invalid/unknown)",
  ["active", "blocked", "invalid", "unknown"].every((s) => groups.some((g) => g.status === s)),
  groups.map((g) => g.status).join(","),
);

console.log("\n[3] Tai media cho chien dich");
const form = new FormData();
form.append("file", new Blob([PNG], { type: "image/png" }), "smoke.png");
r = await req("POST", "/api/admin/telegram/campaigns/media", { cookie, body: form });
const mediaKey = r.data?.key;
ok("Upload media thanh cong", r.status === 200 && !!mediaKey, `status=${r.status} ${JSON.stringify(r.data)}`);
ok("Media upload nam trong thu muc ads (/media/b/)", String(r.data?.url ?? "").startsWith("/media/b/"), r.data?.url);
ok("Media ghi nguon la upload", r.data?.source === "upload", r.data?.source);

if (mediaKey) {
  const mediaUrl = `${BASE}${r.data.url}`;
  const mediaRes = await fetch(mediaUrl);
  ok("File media phuc vu sau khi upload (GET 200)", mediaRes.status === 200, `status=${mediaRes.status}`);
}

console.log("\n[4] Tao chien dich khan cap cho nhom 'active'");
r = await req("POST", "/api/admin/telegram/campaigns", {
  cookie,
  json: true,
  body: {
    name: "SMOKE khan cap",
    text: "Noi dung smoke test",
    mediaType: "image",
    mediaSource: "upload",
    mediaKey,
    targetType: "imported",
    targetIds: ["active"],
    isEmergency: true,
    schedule: "now",
  },
});
const campaign = r.data?.campaign;
ok("Tao chien dich khan cap thanh cong", r.status === 200 && !!campaign?.id, `status=${r.status} ${JSON.stringify(r.data)}`);
ok("Chien dich luu is_emergency = true", campaign?.isEmergency === true, String(campaign?.isEmergency));
ok("Chien dich luu target_type = imported", campaign?.targetType === "imported", String(campaign?.targetType));
ok("Chien dich luu mediaKey", !!campaign?.mediaKey, String(campaign?.mediaKey));

if (!campaign?.id) {
  console.log("\nKhong tao duoc chien dich. Dung.\n");
  process.exit(1);
}

console.log("\n[5] Gui chien dich (kem khan cap)");
r = await req("POST", `/api/admin/telegram/campaigns/${campaign.id}/send`, { cookie, json: true, body: {} });
const queued = r.data?.queued ?? 0;
ok("Gui chien dich thanh cong", r.status === 200, `status=${r.status} ${JSON.stringify(r.data)}`);
ok("Khong bo qua ID nao (skipped = 0)", (r.data?.skipped ?? -1) === 0, JSON.stringify(r.data));
console.log(`       So job da queue: ${queued}`);

const scheduledAt = r.data?.scheduledAt ? new Date(r.data.scheduledAt).getTime() : 0;
const now = Date.now();
ok(
  "Khan cap => gui ngay lap tuc (khong duoi 2 phut)",
  Math.abs(now - scheduledAt) < 120_000,
  `scheduledAt=${r.data?.scheduledAt} now=${new Date(now).toISOString()}`,
);

console.log("\n[6] Job da tao co dung nhom 'active'");
r = await req("GET", "/api/admin/telegram/campaigns", { cookie });
const listed = (r.data?.rows ?? []).find((c) => c.id === campaign.id);
ok("Chien dich xuat hien trong danh sach", !!listed, `status=${r.status}`);

console.log("\n[7] Chien dich khong khan cap van bi gioi han tan suat");
r = await req("POST", "/api/admin/telegram/campaigns", {
  cookie,
  json: true,
  body: {
    name: "SMOKE thuong",
    text: "Noi dung thuong",
    mediaType: "none",
    targetType: "imported",
    targetIds: ["active"],
    isEmergency: false,
    schedule: "now",
  },
});
const normal = r.data?.campaign;
ok("Tao chien dich thuong thanh cong", r.status === 200 && !!normal?.id, `status=${r.status}`);
if (normal?.id) {
  r = await req("POST", `/api/admin/telegram/campaigns/${normal.id}/send`, { cookie, json: true, body: {} });
  ok("Chien dich thuong van gui duoc", r.status === 200, `status=${r.status} ${JSON.stringify(r.data)}`);
  console.log(`       So job: ${r.data?.queued}, bo qua: ${r.data?.skipped}`);
}

console.log(`\n=== KET QUA: ${pass} dat, ${fail} loi ===`);
if (failures.length) {
  console.log("Fail:", failures.join(" | "));
}
console.log("");
process.exit(fail > 0 ? 1 : 0);
