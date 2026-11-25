// Kiem tra chuc nang co ban cua Chong Toi Co (chay: node scripts/smoke.mjs)
const BASE = process.env.BASE || "http://127.0.0.1:8090";
const H = { "X-Requested-With": "ctc" };
const HJ = { ...H, "Content-Type": "application/json" };

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

async function req(method, url, { cookie, body, json } = {}) {
  const headers = { ...(json ? HJ : H) };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : json ? JSON.stringify(body) : body,
  });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, data, setCookie };
}

function cookieFrom(setCookie) {
  const c = setCookie.find((x) => x.startsWith("ctc_sid="));
  return c ? c.split(";")[0] : "";
}

const uniq = Date.now().toString().slice(-6);
const user = `smoke${uniq}`;
const passwd = "smoke123456";

console.log(`\n=== KIEM TRA CHUC NANG CO BAN (${BASE}) ===\n`);

console.log("[1] Khach - xem noi dung");
let r = await req("GET", "/healthz");
ok("GET /healthz", r.status === 200 && r.data?.ok === true);
r = await req("GET", "/api/home");
ok("GET /api/home", r.status === 200 && !!r.data?.articles, `status=${r.status}`);
ok("  - home co nhom today/week/newest/random", !!r.data?.articles?.today && !!r.data?.articles?.week && !!r.data?.articles?.newest && !!r.data?.articles?.random);
r = await req("GET", "/api/articles?sort=new");
ok("GET /api/articles", r.status === 200 && Array.isArray(r.data?.articles));
r = await req("GET", "/api/articles?sort=today");
ok("GET /api/articles?sort=today", r.status === 200);
r = await req("GET", "/api/articles?sort=week");
ok("GET /api/articles?sort=week", r.status === 200);
r = await req("GET", "/api/articles?sort=hot");
ok("GET /api/articles?sort=hot", r.status === 200);
r = await req("GET", "/api/articles?sort=random");
ok("GET /api/articles?sort=random", r.status === 200);
r = await req("GET", "/api/articles?sort=best");
ok("GET /api/articles?sort=best", r.status === 200);
r = await req("GET", "/api/forum/categories");
ok("GET /api/forum/categories", r.status === 200 && r.data?.categories?.length > 0);
r = await req("GET", "/api/forum/feed");
ok("GET /api/forum/feed", r.status === 200);
r = await req("GET", "/api/chat/channels");
ok("GET /api/chat/channels", r.status === 200);
ok("  - khach KHONG thay kenh 'chi BQT'", !r.data?.channels?.some((c) => c.staffOnly));
r = await req("GET", "/api/site");
ok("GET /api/site", r.status === 200);
r = await req("GET", "/api/stats");
ok("GET /api/stats", r.status === 200);

console.log("\n[2] Bai viet - xem chi tiet + binh luan");
r = await req("GET", "/api/articles?sort=new&limit=1");
const art = r.data?.articles?.[0];
ok("Co bai viet trong danh sach", !!art);
if (art) {
  r = await req("GET", `/api/articles/${art.id}`);
  ok("GET /api/articles/:id", r.status === 200 && !!r.data?.article);
  ok("  - tra related (bai goi y)", Array.isArray(r.data?.related));
  const pub = r.data?.article?.visibility === "public";
  r = await req("GET", `/api/articles/${art.id}/comments`);
  if (pub) ok("GET /api/articles/:id/comments (bai cong khai)", r.status === 200);
  else ok("GET /api/articles/:id/comments (bai khoa)", r.status === 200 || r.status === 403, `status=${r.status}`);
}

console.log("\n[3] Trang chu tinh (SPA)");
r = await req("GET", "/");
ok("GET / (giao dien)", r.status === 200);

console.log("\n[4] Dang ky + dang nhap");
r = await req("POST", "/api/auth/register", { body: { username: user, password: passwd }, json: true });
ok("POST /api/auth/register", r.status === 200 && r.data?.user?.role === "member", `status=${r.status} ${r.data?.error || ""}`);
r = await req("POST", "/api/auth/login", { body: { username: user, password: passwd }, json: true });
ok("POST /api/auth/login", r.status === 200 && !!r.data?.user);
const cookie = cookieFrom(r.setCookie);
ok("  - nhan cookie phien", !!cookie);
r = await req("POST", "/api/auth/login", { body: { username: user, password: "sai_mat_khau" }, json: true });
ok("Dang nhap sai mat khau bi tu choi", r.status === 400 || r.status === 401, `status=${r.status}`);

console.log("\n[5] Thanh vien - chuc nang ca nhan");
r = await req("GET", "/api/auth/me", { cookie });
ok("GET /api/auth/me", r.status === 200 && !!r.data?.user);
r = await req("GET", "/api/notifications", { cookie });
ok("GET /api/notifications", r.status === 200, `status=${r.status}`);
r = await req("GET", "/api/me/following", { cookie });
ok("GET /api/me/following", r.status === 200, `status=${r.status}`);
r = await req("GET", "/api/me/following-feed", { cookie });
ok("GET /api/me/following-feed", r.status === 200, `status=${r.status}`);
r = await req("GET", "/api/articles/history", { cookie });
ok("GET /api/articles/history", r.status === 200, `status=${r.status}`);
r = await req("GET", "/api/articles/saved", { cookie });
ok("GET /api/articles/saved", r.status === 200, `status=${r.status}`);
r = await req("GET", `/api/members/${user}`, { cookie });
ok("GET /api/members/:username", r.status === 200, `status=${r.status}`);
r = await req("PATCH", "/api/me", { cookie, body: { bio: "Chao ban!" }, json: true });
ok("PATCH /api/me (cap nhat gioi thieu)", r.status === 200, `status=${r.status}`);

console.log("\n[6] Tuong tac voi bai viet (binh luan / chon / yeu thich)");
if (art) {
  r = await req("POST", `/api/articles/${art.id}/comments`, { cookie, body: { content: "Binh luan kiem thu tu dong." }, json: true });
  ok("POST /api/articles/:id/comments", r.status === 200, `status=${r.status} ${r.data?.error || ""}`);
  r = await req("POST", `/api/articles/${art.id}/vote`, { cookie, body: { value: 1 }, json: true });
  ok("POST /api/articles/:id/vote (like)", r.status === 200, `status=${r.status} ${r.data?.error || ""}`);
  r = await req("POST", `/api/articles/${art.id}/save`, { cookie, body: { list: "favorite" }, json: true });
  ok("POST /api/articles/:id/save (yeu thich)", r.status === 200, `status=${r.status} ${r.data?.error || ""}`);
  r = await req("GET", `/api/articles/${art.id}/comments`);
  const cmt = r.data?.comments?.find((c) => c.content?.includes("kiem thu tu dong"));
  ok("  - binh luan da luu va doc lai duoc", !!cmt);
  r = await req("GET", `/api/articles/${art.id}/comments`);
  ok("  - dem binh luan > 0", (r.data?.total ?? 0) > 0);
}

console.log("\n[7] Chat - gui tin nhan");
const chans = (await req("GET", "/api/chat/channels", { cookie })).data?.channels ?? [];
const pubChan = chans.find((c) => !c.staffOnly);
if (pubChan) {
  r = await req("POST", `/api/chat/channels/${pubChan.id}/messages`, { cookie, body: { content: "Tin nhan kiem thu tu dong." }, json: true });
  ok("POST /api/chat/channels/:id/messages", r.status === 200, `status=${r.status} ${r.data?.error || ""}`);
  r = await req("GET", `/api/chat/channels/${pubChan.id}/messages`, { cookie });
  ok("GET /api/chat/channels/:id/messages", r.status === 200, `status=${r.status}`);
  ok("  - tin nhan da gui doc lai duoc", !!r.data?.messages?.find((m) => m.content?.includes("kiem thu tu dong")));
} else {
  ok("Co kenh chat cong khai", false);
}

console.log("\n[8] Quyen - thanh vien KHONG duoc dang bai / up anh");
if (art) {
  r = await req("POST", `/api/forum/threads`, { cookie, body: { categoryId: 2, title: "Khong duoc phep", content: "x" }, json: true });
  ok("POST /api/forum/threads (thanh vien) bi chan 403", r.status === 403, `status=${r.status}`);
  r = await req("POST", `/api/admin/articles/${art.id}/images`, { cookie, body: "x" });
  ok("POST /api/admin/articles/:id/images (thanh vien) bi chan 403", r.status === 403, `status=${r.status}`);
  r = await req("GET", "/api/admin/overview", { cookie });
  ok("GET /api/admin/overview (thanh vien) bi chan 403", r.status === 403, `status=${r.status}`);
}

console.log("\n[9] Quyen - bai 'chi thanh vien' bi khoa");
const locked = (await req("GET", "/api/articles?sort=new&limit=50")).data?.articles?.find((a) => a.membersOnly);
if (locked) {
  r = await req("GET", `/api/articles/${locked.id}`);
  ok("Khach xem bai khoa: locked=true, coverUrl=null, images=[]", r.data?.article?.locked === true && r.data?.article?.coverUrl === null && r.data?.article?.images?.length === 0);
  r = await req("GET", `/api/articles/${locked.id}/comments`);
  ok("Khach doc binh luan bai khoa bi chan 403", r.status === 403, `status=${r.status}`);
  r = await req("GET", `/api/articles/${locked.id}`, { cookie });
  ok("Thanh vien vao duoc bai khoa", r.status === 200 && r.data?.article?.locked === false);
} else {
  console.log("  -- (khong co bai 'chi thanh vien' trong du lieu hien tai)");
}

console.log("\n[10] CSKH (ho tro khach)");
r = await req("POST", "/api/support/messages", { body: { content: "Can ho tro" }, json: true });
ok("POST /api/support/messages (khach)", r.status === 200 || r.status === 201, `status=${r.status} ${r.data?.error || ""}`);

console.log("\n[11] Bao cao + quyet dinh");
r = await req("POST", "/api/reports", { cookie, body: { targetType: "article", targetId: art?.id ?? 1, reason: "spam" }, json: true });
ok("POST /api/reports (bao vi pham)", r.status === 200 || r.status === 201, `status=${r.status} ${r.data?.error || ""}`);
r = await req("GET", "/api/site");
ok("GET /api/site (cai dat trang)", r.status === 200);

console.log("\n[12] CSRF + rate limit");
{
  // Gửi POST không kèm header CSRF => phải bị chặn 403.
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password: passwd }),
  });
  ok("Thieu header CSRF bi chan 403", res.status === 403, `status=${res.status}`);
}

console.log("\n[13] Quyen admin");
r = await req("POST", "/api/auth/login", { body: { username: "admin", password: "admin123456" }, json: true });
const adminCookie = cookieFrom(r.setCookie);
ok("Dang nhap admin", r.status === 200 && r.data?.user?.role === "admin", `status=${r.status}`);
if (adminCookie) {
  r = await req("GET", "/api/admin/overview", { cookie: adminCookie });
  ok("GET /api/admin/overview", r.status === 200, `status=${r.status}`);
  r = await req("GET", "/api/admin/users", { cookie: adminCookie });
  ok("GET /api/admin/users", r.status === 200, `status=${r.status}`);
  r = await req("GET", "/api/chat/channels", { cookie: adminCookie });
  ok("Admin THAY kenh 'chi BQT'", !!r.data?.channels?.some((c) => c.staffOnly));
  r = await req("POST", "/api/admin/recount", { cookie: adminCookie, body: {}, json: true });
  ok("POST /api/admin/recount", r.status === 200, `status=${r.status}`);
}

console.log(`\n=== KET QUA: ${pass} PASS, ${fail} FAIL ===`);
if (fail) console.log(`Fail: ${failures.join(", ")}`);
process.exit(fail ? 1 : 0);
