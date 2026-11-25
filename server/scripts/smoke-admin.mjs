// Kiem tra luong admin: tao bai viet + tai anh + video + chon anh bia (chay: node scripts/smoke-admin.mjs)
const BASE = process.env.BASE || "http://127.0.0.1:8090";
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

async function req(method, url, { cookie, body, json } = {}) {
  const headers = { ...(json ? { ...H, "Content-Type": "application/json" } : H) };
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
const cookieFrom = (sc) => {
  const c = sc.find((x) => x.startsWith("ctc_sid="));
  return c ? c.split(";")[0] : "";
};

// PNG 1x1 hop le
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
// MP4 goc toi thieu (ftyp) - chi de kiem tra luong, khong phat duoc
const MP4 = Buffer.from("0000001c667479706d70343200000000", "hex");

console.log(`\n=== KIEM TRA LUONG ADMIN (${BASE}) ===\n`);

console.log("[1] Dang nhap admin");
let r = await req("POST", "/api/auth/login", { body: { username: "admin", password: "admin123456" }, json: true });
ok("Dang nhap admin", r.status === 200 && r.data?.user?.role === "admin", `status=${r.status}`);
const cookie = cookieFrom(r.setCookie);
if (!cookie) {
  console.log("\nKhong lay duoc cookie. Dung.\n");
  process.exit(1);
}

console.log("\n[2] Tao bai viet (co anh + video)");
r = await req("POST", "/api/admin/articles", {
  cookie,
  body: { title: `Kiem thu tu dong ${Date.now()}`, description: "Bai viet kiem thu.", visibility: "public" },
  json: true,
});
ok("POST /api/admin/articles (tao bai viet)", r.status === 200 && !!r.data?.article?.id, `status=${r.status} ${r.data?.error || ""}`);
const artId = r.data?.article?.id;

console.log("\n[3] Tai len 2 anh");
for (let i = 1; i <= 2; i++) {
  const form = new FormData();
  form.append("file", new Blob([PNG], { type: "image/png" }), `test${i}.png`);
  const res = await fetch(`${BASE}/api/admin/articles/${artId}/images`, { method: "POST", headers: { ...H, Cookie: cookie }, body: form });
  const data = await res.json().catch(() => null);
  ok(`POST /api/admin/articles/:id/images (anh ${i})`, res.status === 200 && !!data?.image?.id, `status=${res.status} ${data?.error || ""}`);
}

console.log("\n[4] Tai len video");
{
  const form = new FormData();
  form.append("video", new Blob([MP4], { type: "video/mp4" }), "test.mp4");
  const res = await fetch(`${BASE}/api/admin/articles/${artId}/videos`, { method: "POST", headers: { ...H, Cookie: cookie }, body: form });
  const data = await res.json().catch(() => null);
  ok("POST /api/admin/articles/:id/videos (tai video)", res.status === 200 && !!data?.video?.id, `status=${res.status} ${data?.error || ""}`);
}

console.log("\n[5] Chon anh bia");
{
  const det = (await req("GET", `/api/admin/articles/${artId}`, { cookie })).data?.article;
  const imageId = det?.images?.[0]?.id;
  const videoId = det?.videos?.[0]?.id;
  ok("GET /api/admin/articles/:id (admin xem chi tiet)", !!det, `status=${r.status}`);
  if (imageId) {
    r = await req("POST", `/api/admin/articles/${artId}/cover`, { cookie, body: { type: "image", imageId }, json: true });
    ok("POST .../cover (chon anh bia)", r.status === 200, `status=${r.status} ${r.data?.error || ""}`);
  }
  if (videoId) {
    // Video mau khong co khung hinh (may khong co ffmpeg) => API phai bao loi ro rang
    // thay vi lam bai mat anh bia. Neu co khung hinh thi phai thanh cong.
    r = await req("POST", `/api/admin/articles/${artId}/cover`, { cookie, body: { type: "video", videoId }, json: true });
    const hasThumb = !!det?.videos?.[0]?.thumbKey;
    if (hasThumb) {
      ok("POST .../cover (chon video bia co khung hinh)", r.status === 200, `status=${r.status} ${r.data?.error || ""}`);
    } else {
      ok("POST .../cover (video chua co khung hinh) bi bao loi", r.status === 400, `status=${r.status}`);
      const after = (await req("GET", `/api/articles/${artId}`, { cookie })).data?.article;
      ok("  - bai van con anh bia (khong bi mat bia)", !!after?.coverUrl, `coverUrl=${after?.coverUrl}`);
    }
  }
}

console.log("\n[6] Kiem tra bai viet sau khi dong gop");
{
  const det = (await req("GET", `/api/articles/${artId}`, { cookie })).data?.article;
  ok("  - imageCount = 2", det?.imageCount === 2, `imageCount=${det?.imageCount}`);
  ok("  - videoCount = 1", det?.videoCount === 1, `videoCount=${det?.videoCount}`);
  ok("  - co anh bia", !!det?.coverUrl, `coverUrl=${det?.coverUrl}`);
  ok("  - tra ve 2 anh + 1 video", det?.images?.length === 2 && det?.videos?.length === 1, `imgs=${det?.images?.length} vids=${det?.videos?.length}`);
}

console.log("\n[7] File media co phuc vu duoc khong");
{
  const det = (await req("GET", `/api/articles/${artId}`, { cookie })).data?.article;
  const imgUrl = det?.images?.[0]?.url;
  const vidUrl = det?.videos?.[0]?.url;
  if (imgUrl) {
    const res = await fetch(`${BASE}${imgUrl}`);
    ok(`GET ${imgUrl} (anh)`, res.status === 200, `status=${res.status}`);
  }
  if (vidUrl) {
    const res = await fetch(`${BASE}${vidUrl}`, { method: "GET", headers: { Range: "bytes=0-99" } });
    ok(`GET ${vidUrl} (video, co Range)`, res.status === 200 || res.status === 206, `status=${res.status}`);
  }
}

console.log("\n[8] Xoa anh va video");
{
  const det = (await req("GET", `/api/admin/articles/${artId}`, { cookie })).data?.article;
  const imageId = det?.images?.[0]?.id;
  const videoId = det?.videos?.[0]?.id;
  const coverBefore = det?.coverUrl;
  if (imageId) {
    r = await req("DELETE", `/api/admin/articles/${artId}/images/${imageId}`, { cookie });
    ok("DELETE anh", r.status === 200, `status=${r.status}`);
  }
  if (videoId) {
    r = await req("DELETE", `/api/admin/articles/${artId}/videos/${videoId}`, { cookie });
    ok("DELETE video", r.status === 200, `status=${r.status}`);
  }
  const after = (await req("GET", `/api/articles/${artId}`, { cookie })).data?.article;
  ok("  - imageCount giam con 1", after?.imageCount === 1, `imageCount=${after?.imageCount}`);
  ok("  - videoCount giam con 0", after?.videoCount === 0, `videoCount=${after?.videoCount}`);
  ok("  - bai VAN CON anh bia sau khi xoa media (B21)", !!after?.coverUrl, `coverUrl=${after?.coverUrl} (truoc: ${coverBefore})`);
}

console.log("\n[9] Sua bai viet + doi quyen 'chi thanh vien'");
{
  r = await req("PATCH", `/api/admin/articles/${artId}`, { cookie, body: { title: "Da sua tieu de", visibility: "members" }, json: true });
  ok("PATCH /api/admin/articles/:id", r.status === 200, `status=${r.status} ${r.data?.error || ""}`);
  const asGuest = await req("GET", `/api/articles/${artId}`);
  ok("  - khach thay locked=true, coverUrl=null", asGuest.data?.article?.locked === true && asGuest.data?.article?.coverUrl === null);
  r = await req("PATCH", `/api/admin/articles/${artId}`, { cookie, body: { visibility: "public" }, json: true });
  ok("  - doi lai ve public", r.status === 200, `status=${r.status}`);
}

console.log("\n[10] Xoa bai viet (don dep file)");
{
  r = await req("DELETE", `/api/admin/articles/${artId}`, { cookie });
  ok("DELETE /api/admin/articles/:id", r.status === 200, `status=${r.status}`);
  r = await req("GET", `/api/articles/${artId}`, { cookie });
  ok("  - bai viet da bi xoa (404)", r.status === 404, `status=${r.status}`);
}

console.log("\n[11] Quan tri - the loai, kenh chat, danh muc");
{
  r = await req("GET", "/api/admin/categories", { cookie });
  ok("GET /api/admin/categories", r.status === 200, `status=${r.status}`);
  r = await req("GET", "/api/admin/channels", { cookie });
  ok("GET /api/admin/channels", r.status === 200, `status=${r.status}`);
  r = await req("GET", "/api/admin/settings", { cookie });
  ok("GET /api/admin/settings", r.status === 200, `status=${r.status}`);
  r = await req("GET", "/api/admin/reports", { cookie });
  ok("GET /api/admin/reports (hang doi bao vi pham)", r.status === 200, `status=${r.status}`);
}

console.log(`\n=== KET QUA: ${pass} PASS, ${fail} FAIL ===`);
if (fail) console.log(`Fail: ${failures.join(", ")}`);
process.exit(fail ? 1 : 0);
