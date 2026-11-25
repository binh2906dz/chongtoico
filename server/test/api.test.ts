import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import sharp from "sharp";

const uploadDir = mkdtempSync(path.join(os.tmpdir(), "ctc-test-"));
process.env.DATABASE_URL = "pglite:memory";
process.env.UPLOAD_DIR = uploadDir;
process.env.PUBLIC_DIR = path.join(uploadDir, "no-frontend");
process.env.ADMIN_USERNAME = "boss";
process.env.ADMIN_PASSWORD = "boss-password";

const { initDb, closeDb } = await import("../src/db/index.js");
const { buildApp } = await import("../src/app.js");
const { seed } = await import("../src/seed.js");

type App = Awaited<ReturnType<typeof buildApp>>;
let app: App;

const H = { "x-requested-with": "ctc" };

function cookieOf(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.map((c: string) => c.split(";")[0]).join("; ");
}

async function login(username: string, password: string) {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", headers: H, payload: { username, password } });
  assert.equal(res.statusCode, 200, res.body);
  return cookieOf(res);
}

async function register(username: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: H,
    payload: { username, password: "secret123" },
  });
  assert.equal(res.statusCode, 200, res.body);
  return { cookie: cookieOf(res), user: res.json().user };
}

function multipart(files: { name: string; data: Buffer }[]) {
  const boundary = "----ctcboundary";
  const chunks: Buffer[] = [];
  for (const f of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${f.name}"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      f.data,
      Buffer.from("\r\n"),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 50, b: 50 } } }).png().toBuffer();

describe("Chống Tối Cổ API", () => {
  let admin = "";
  let alice = { cookie: "", user: { id: 0 } };
  let bob = { cookie: "", user: { id: 0 } };
  let threadId = 0;
  let firstPostId = 0;
  let replyId = 0;

  before(async () => {
    await initDb("pglite:memory");
    app = await buildApp({ logger: false });
    await seed(() => {});
    admin = await login("boss", "boss-password");
    alice = await register("alice");
    bob = await register("Bob_1");
  });

  after(async () => {
    await app.close();
    await closeDb();
    rmSync(uploadDir, { recursive: true, force: true });
  });

  it("healthz and seeded data", async () => {
    assert.equal((await app.inject("/healthz")).statusCode, 200);
    const cats = (await app.inject("/api/forum/categories")).json().categories;
    assert.ok(cats.length >= 5);
    const chans = (await app.inject("/api/chat/channels")).json().channels;
    assert.ok(chans.some((c: { slug: string }) => c.slug === "chung"));
  });

  it("rejects mutations without the CSRF header", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "boss", password: "x" } });
    assert.equal(res.statusCode, 403);
  });

  it("validates registration and login", async () => {
    let res = await app.inject({ method: "POST", url: "/api/auth/register", headers: H, payload: { username: "ALICE", password: "secret123" } });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /đã có người dùng/);
    res = await app.inject({ method: "POST", url: "/api/auth/register", headers: H, payload: { username: "a b", password: "secret123" } });
    assert.equal(res.statusCode, 400);
    res = await app.inject({ method: "POST", url: "/api/auth/login", headers: H, payload: { username: "alice", password: "wrong" } });
    assert.equal(res.statusCode, 400);
    const me = (await app.inject({ url: "/api/auth/me", headers: { cookie: alice.cookie } })).json();
    assert.equal(me.user.username, "alice");
    assert.equal((await app.inject("/api/auth/me")).json().user, null);
  });

  it("enforces staff-only categories and admin-only posting", async () => {
    const cats = (await app.inject("/api/forum/categories")).json().categories;
    const announce = cats.find((c: { slug: string }) => c.slug === "thong-bao");
    const res = await app.inject({
      method: "POST",
      url: "/api/forum/threads",
      headers: { ...H, cookie: alice.cookie },
      payload: { categoryId: announce.id, title: "Không được", content: "x" },
    });
    assert.equal(res.statusCode, 403);

    // Chỉ quản trị viên được tạo chủ đề mới.
    const chat = cats.find((c: { slug: string }) => c.slug === "tan-gau");
    const member = await app.inject({
      method: "POST",
      url: "/api/forum/threads",
      headers: { ...H, cookie: alice.cookie },
      payload: { categoryId: chat.id, title: "Thành viên không được đăng", content: "x" },
    });
    assert.equal(member.statusCode, 403);
  });

  it("creates threads, replies, likes and keeps counters", async () => {
    const cats = (await app.inject("/api/forum/categories")).json().categories;
    const chat = cats.find((c: { slug: string }) => c.slug === "tan-gau");
    let res = await app.inject({
      method: "POST",
      url: "/api/forum/threads",
      headers: { ...H, cookie: admin },
      payload: { categoryId: chat.id, title: "Chào cả nhà", content: "Bài đầu tiên" },
    });
    assert.equal(res.statusCode, 200, res.body);
    threadId = res.json().thread.id;

    // Thành viên không được trả lời trong chủ đề.
    res = await app.inject({
      method: "POST",
      url: `/api/forum/threads/${threadId}/posts`,
      headers: { ...H, cookie: bob.cookie },
      payload: { content: "Chào bạn" },
    });
    assert.equal(res.statusCode, 403);

    res = await app.inject({
      method: "POST",
      url: `/api/forum/threads/${threadId}/posts`,
      headers: { ...H, cookie: admin },
      payload: { content: "Chào bạn" },
    });
    assert.equal(res.statusCode, 200, res.body);
    replyId = res.json().post.id;

    const page = (await app.inject(`/api/forum/threads/${threadId}`)).json();
    assert.equal(page.posts.length, 2);
    assert.equal(page.thread.replyCount, 1);
    assert.equal(page.thread.lastPoster.username, "boss");
    firstPostId = page.posts[0].id;

    res = await app.inject({ method: "POST", url: `/api/forum/posts/${firstPostId}/like`, headers: { ...H, cookie: bob.cookie } });
    assert.deepEqual(res.json(), { liked: true, likeCount: 1 });
    res = await app.inject({ method: "POST", url: `/api/forum/posts/${firstPostId}/like`, headers: { ...H, cookie: admin } });
    assert.equal(res.statusCode, 400);

    const liked = (await app.inject({ url: `/api/forum/threads/${threadId}`, headers: { cookie: bob.cookie } })).json();
    assert.equal(liked.posts[0].likedByMe, true);

    const profile = (await app.inject("/api/members/boss")).json().user;
    assert.equal(profile.threadCount, 1);
    assert.equal(profile.postCount, 2);
    assert.equal(profile.likeCount, 1);
  });

  it("serves feeds, home and search", async () => {
    for (const type of ["latest", "updated", "hot", "trending"]) {
      const feed = (await app.inject(`/api/forum/feed?type=${type}`)).json();
      assert.equal(feed.threads[0].id, threadId, type);
    }
    const home = (await app.inject("/api/home")).json();
    assert.equal(home.stats.threads, 1);
    assert.equal(home.stats.posts, 2);
    assert.equal(home.feeds.hot.length, 1);
    const search = (await app.inject(`/api/forum/search?q=${encodeURIComponent("chào")}`)).json();
    assert.equal(search.threads.length, 1);
    const cat = (await app.inject("/api/forum/categories/tan-gau")).json();
    assert.equal(cat.threads.length, 1);
    assert.equal(cat.category.threadCount, 1);
  });

  it("locks threads for members but not staff", async () => {
    let res = await app.inject({
      method: "PATCH",
      url: `/api/forum/threads/${threadId}`,
      headers: { ...H, cookie: alice.cookie },
      payload: { isLocked: true },
    });
    assert.equal(res.statusCode, 403);
    res = await app.inject({
      method: "PATCH",
      url: `/api/forum/threads/${threadId}`,
      headers: { ...H, cookie: admin },
      payload: { isLocked: true, isPinned: true },
    });
    assert.equal(res.statusCode, 200, res.body);
    res = await app.inject({
      method: "POST",
      url: `/api/forum/threads/${threadId}/posts`,
      headers: { ...H, cookie: bob.cookie },
      payload: { content: "bị khoá" },
    });
    assert.equal(res.statusCode, 403);
    await app.inject({ method: "PATCH", url: `/api/forum/threads/${threadId}`, headers: { ...H, cookie: admin }, payload: { isLocked: false } });
  });

  it("deletes a reply and updates counters", async () => {
    const res = await app.inject({ method: "DELETE", url: `/api/forum/posts/${replyId}`, headers: { ...H, cookie: admin } });
    assert.equal(res.statusCode, 200, res.body);
    const page = (await app.inject(`/api/forum/threads/${threadId}`)).json();
    assert.equal(page.thread.replyCount, 0);
    assert.equal(page.thread.lastPoster.username, "boss");
    assert.equal((await app.inject("/api/members/boss")).json().user.postCount, 1);
  });

  it("chat messages", async () => {
    // Kênh "chỉ BQT" không được hiện cho khách.
    const guestChans = (await app.inject("/api/chat/channels")).json().channels;
    assert.ok(guestChans.some((c: { slug: string }) => c.slug === "chung"));
    assert.ok(!guestChans.some((c: { slug: string }) => c.slug === "luat"));
    const chans = (await app.inject({ url: "/api/chat/channels", headers: { cookie: admin } })).json().channels;
    const general = chans.find((c: { slug: string }) => c.slug === "chung");
    const rules = chans.find((c: { slug: string }) => c.slug === "luat");
    let res = await app.inject({ method: "POST", url: `/api/chat/channels/${general.id}/messages`, headers: H, payload: { content: "hi" } });
    assert.equal(res.statusCode, 401);
    res = await app.inject({
      method: "POST",
      url: `/api/chat/channels/${general.id}/messages`,
      headers: { ...H, cookie: alice.cookie },
      payload: { content: "Xin chào mọi người" },
    });
    assert.equal(res.statusCode, 200, res.body);
    res = await app.inject({
      method: "POST",
      url: `/api/chat/channels/${rules.id}/messages`,
      headers: { ...H, cookie: bob.cookie },
      payload: { content: "x" },
    });
    assert.equal(res.statusCode, 403);
    // Khách không được đọc nội dung kênh chỉ BQT.
    assert.equal((await app.inject(`/api/chat/channels/${rules.id}/messages`)).statusCode, 403);
    const msgs = (await app.inject(`/api/chat/channels/${general.id}/messages`)).json().messages;
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].author.username, "alice");
  });

  it("articles: admin-only create, upload, members-only lock, cover selection, media serving", async () => {
    // Thành viên thường không được đăng bài viết.
    let res = await app.inject({
      method: "POST",
      url: "/api/admin/articles",
      headers: { ...H, cookie: alice.cookie },
      payload: { title: "Không phải admin" },
    });
    assert.equal(res.statusCode, 403);

    res = await app.inject({
      method: "POST",
      url: "/api/admin/articles",
      headers: { ...H, cookie: admin },
      payload: { title: "Phong cảnh", visibility: "members", isHot: true },
    });
    assert.equal(res.statusCode, 200, res.body);
    const articleId = res.json().article.id;

    // Tải ảnh lên (1 ảnh / 1 request).
    for (const [name, w, h] of [
      ["a.png", 3000, 2000],
      ["b.png", 400, 300],
    ] as const) {
      const mp = multipart([{ name, data: await png(w, h) }]);
      const up = await app.inject({
        method: "POST",
        url: `/api/admin/articles/${articleId}/images`,
        headers: { ...H, cookie: admin, "content-type": mp.contentType },
        payload: mp.payload,
      });
      assert.equal(up.statusCode, 200, up.body);
    }

    const bad = multipart([{ name: "x.png", data: Buffer.from("not an image") }]);
    res = await app.inject({
      method: "POST",
      url: `/api/admin/articles/${articleId}/images`,
      headers: { ...H, cookie: admin, "content-type": bad.contentType },
      payload: bad.payload,
    });
    assert.equal(res.statusCode, 400);

    // Khách chưa đăng nhập không thấy media của bài chỉ thành viên.
    const guest = (await app.inject(`/api/articles/${articleId}`)).json();
    assert.equal(guest.article.locked, true);
    assert.equal(guest.article.images.length, 0);
    const member = (await app.inject({ url: `/api/articles/${articleId}`, headers: { cookie: bob.cookie } })).json();
    assert.equal(member.article.images.length, 2);
    assert.equal(member.article.images[0].width, 2000);
    assert.ok(member.article.coverUrl);

    const url = member.article.images[0].url;
    assert.equal((await app.inject(url)).statusCode, 403);
    const img = await app.inject({ url, headers: { cookie: bob.cookie } });
    assert.equal(img.statusCode, 200);
    assert.equal(img.headers["content-type"], "image/webp");
    assert.equal((await app.inject({ url: member.article.images[0].thumbUrl, headers: { cookie: bob.cookie } })).statusCode, 200);
    assert.equal((await app.inject("/media/a/../../etc.webp")).statusCode, 404);

    // Khách không được đọc bình luận của bài "chỉ thành viên".
    const cm = await app.inject({
      method: "POST",
      url: `/api/articles/${articleId}/comments`,
      headers: { ...H, cookie: bob.cookie },
      payload: { content: "Bình luận nội bộ" },
    });
    assert.equal(cm.statusCode, 200, cm.body);
    const guestComments = await app.inject(`/api/articles/${articleId}/comments`);
    assert.equal(guestComments.statusCode, 403);
    const memberComments = await app.inject({ url: `/api/articles/${articleId}/comments`, headers: { cookie: bob.cookie } });
    assert.equal(memberComments.statusCode, 200);
    assert.equal(memberComments.json().comments.length, 1);

    const list = (await app.inject("/api/articles?sort=new")).json();
    assert.equal(list.articles.length, 1);
    assert.equal(list.articles[0].imageCount, 2);
    // Khách không được thấy ảnh bìa của bài "chỉ thành viên" (ảnh sẽ trả 403).
    assert.equal(list.articles[0].coverUrl, null);
    assert.equal(list.articles[0].membersOnly, true);
    // Thành viên đã đăng nhập thì thấy ảnh bìa.
    const memberList = (await app.inject({ url: "/api/articles?sort=new", headers: { cookie: bob.cookie } })).json();
    assert.ok(memberList.articles[0].coverUrl);

    // Chọn ảnh bìa thứ 2.
    res = await app.inject({
      method: "POST",
      url: `/api/admin/articles/${articleId}/cover`,
      headers: { ...H, cookie: admin },
      payload: { type: "image", imageId: member.article.images[1].id },
    });
    assert.equal(res.statusCode, 200, res.body);
    const admin2 = (await app.inject({ url: `/api/admin/articles/${articleId}`, headers: { cookie: admin } })).json();
    assert.equal(admin2.article.coverType, "image");
    assert.equal(admin2.article.coverImageKey, admin2.article.images[1].fileKey);

    // Xoá ảnh đầu tiên.
    res = await app.inject({
      method: "DELETE",
      url: `/api/admin/articles/${articleId}/images/${member.article.images[0].id}`,
      headers: { ...H, cookie: admin },
    });
    assert.equal(res.statusCode, 200);
    const after2 = (await app.inject({ url: `/api/articles/${articleId}`, headers: { cookie: bob.cookie } })).json();
    assert.equal(after2.article.imageCount, 1);
  });

  it("deletes an article and cleans up its media", async () => {
    let res = await app.inject({
      method: "POST",
      url: "/api/admin/articles",
      headers: { ...H, cookie: admin },
      payload: { title: "Sẽ xoá" },
    });
    assert.equal(res.statusCode, 200, res.body);
    const id = res.json().article.id;

    const mp = multipart([{ name: "a.png", data: await png(600, 400) }]);
    res = await app.inject({
      method: "POST",
      url: `/api/admin/articles/${id}/images`,
      headers: { ...H, cookie: admin, "content-type": mp.contentType },
      payload: mp.payload,
    });
    assert.equal(res.statusCode, 200, res.body);

    // Xoá bài viết phải trả 200 kể cả khi file trên đĩa bị khoá (Windows/OneDrive).
    res = await app.inject({
      method: "DELETE",
      url: `/api/admin/articles/${id}`,
      headers: { ...H, cookie: admin },
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await app.inject(`/api/articles/${id}`)).statusCode, 404);
  });

  it("avatar and post image upload", async () => {
    const mp = multipart([{ name: "me.png", data: await png(800, 600) }]);
    let res = await app.inject({
      method: "POST",
      url: "/api/me/avatar",
      headers: { ...H, cookie: alice.cookie, "content-type": mp.contentType },
      payload: mp.payload,
    });
    assert.equal(res.statusCode, 200, res.body);
    const avatar = res.json().user.avatarUrl;
    assert.equal((await app.inject(avatar)).statusCode, 200);

    res = await app.inject({
      method: "POST",
      url: "/api/uploads/image",
      headers: { ...H, cookie: admin, "content-type": mp.contentType },
      payload: mp.payload,
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.match(res.json().markup, /^\[img:[a-f0-9]{32}\]$/);
    assert.equal((await app.inject(res.json().url)).statusCode, 200);

    // Thành viên không được tải ảnh lên.
    res = await app.inject({
      method: "POST",
      url: "/api/uploads/image",
      headers: { ...H, cookie: alice.cookie, "content-type": mp.contentType },
      payload: mp.payload,
    });
    assert.equal(res.statusCode, 403);
  });

  it("support chat: guest and staff", async () => {
    let res = await app.inject("/api/support/conversation");
    const guestCookie = cookieOf(res);
    assert.match(guestCookie, /ctc_guest=/);
    assert.equal(res.json().conversation, null);

    res = await app.inject({
      method: "POST",
      url: "/api/support/messages",
      headers: { ...H, cookie: guestCookie },
      payload: { content: "Cần hỗ trợ", guestName: "Khách" },
    });
    assert.equal(res.statusCode, 200, res.body);
    const convId = res.json().conversationId;

    assert.equal((await app.inject({ url: "/api/admin/support", headers: { cookie: alice.cookie } })).statusCode, 403);
    const list = (await app.inject({ url: "/api/admin/support", headers: { cookie: admin } })).json();
    assert.equal(list.conversations[0].id, convId);
    assert.equal(list.conversations[0].lastContent, "Cần hỗ trợ");
    assert.equal(list.conversations[0].unreadStaff, 1);

    res = await app.inject({
      method: "POST",
      url: `/api/admin/support/${convId}/messages`,
      headers: { ...H, cookie: admin },
      payload: { content: "Chào bạn, mình giúp gì được?" },
    });
    assert.equal(res.statusCode, 200, res.body);

    const mine = (await app.inject({ url: "/api/support/conversation", headers: { cookie: guestCookie } })).json();
    assert.equal(mine.messages.length, 2);
    assert.equal(mine.messages[1].fromStaff, true);
    assert.equal(mine.messages[1].staff.username, "boss");
  });

  it("ban blocks posting and shows on profile; unban restores", async () => {
    let res = await app.inject({
      method: "POST",
      url: `/api/admin/users/${bob.user.id}/ban`,
      headers: { ...H, cookie: alice.cookie },
      payload: { reason: "spam" },
    });
    assert.equal(res.statusCode, 403);
    res = await app.inject({
      method: "POST",
      url: `/api/admin/users/${bob.user.id}/ban`,
      headers: { ...H, cookie: admin },
      payload: { reason: "Spam", days: 3 },
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().user.isBanned, true);

    res = await app.inject({
      method: "POST",
      url: `/api/forum/threads/${threadId}/posts`,
      headers: { ...H, cookie: bob.cookie },
      payload: { content: "vẫn nói" },
    });
    assert.equal(res.statusCode, 403);
    const profile = (await app.inject("/api/members/Bob_1")).json().user;
    assert.equal(profile.isBanned, true);
    assert.equal(profile.banReason, "Spam");

    await app.inject({ method: "POST", url: `/api/admin/users/${bob.user.id}/unban`, headers: { ...H, cookie: admin } });
    assert.equal((await app.inject("/api/members/Bob_1")).json().user.isBanned, false);
  });

  it("admin overview, users, roles, categories, recount", async () => {
    const ov = (await app.inject({ url: "/api/admin/overview", headers: { cookie: admin } })).json();
    assert.equal(ov.members, 3);
    const users = (await app.inject({ url: "/api/admin/users?q=ali", headers: { cookie: admin } })).json();
    assert.equal(users.users.length, 1);

    let res = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${alice.user.id}/role`,
      headers: { ...H, cookie: admin },
      payload: { role: "mod" },
    });
    assert.equal(res.json().user.role, "mod");

    res = await app.inject({
      method: "POST",
      url: "/api/admin/categories",
      headers: { ...H, cookie: admin },
      payload: { slug: "tan-gau", title: "Trùng" },
    });
    assert.equal(res.statusCode, 400);
    res = await app.inject({
      method: "POST",
      url: "/api/admin/categories",
      headers: { ...H, cookie: admin },
      payload: { slug: "the-thao", title: "Thể thao", icon: "⚽" },
    });
    assert.equal(res.statusCode, 200, res.body);

    res = await app.inject({ method: "POST", url: "/api/admin/recount", headers: { ...H, cookie: admin } });
    assert.equal(res.statusCode, 200, res.body);
    const profile = (await app.inject("/api/members/boss")).json().user;
    assert.equal(profile.postCount, 1);
    assert.equal(profile.likeCount, 1);
    const aliceProfile = (await app.inject("/api/members/alice")).json().user;
    assert.equal(aliceProfile.postCount, 0);
    assert.equal(aliceProfile.likeCount, 0);
  });

  it("deleting the first post deletes the thread and fixes counters", async () => {
    const res = await app.inject({ method: "DELETE", url: `/api/forum/posts/${firstPostId}`, headers: { ...H, cookie: admin } });
    assert.equal(res.json().threadDeleted, true);
    assert.equal((await app.inject(`/api/forum/threads/${threadId}`)).statusCode, 404);
    const profile = (await app.inject("/api/members/boss")).json().user;
    assert.equal(profile.threadCount, 0);
    assert.equal(profile.postCount, 0);
    assert.equal(profile.likeCount, 0);
    const cat = (await app.inject("/api/forum/categories/tan-gau")).json().category;
    assert.equal(cat.threadCount, 0);
    assert.equal(cat.postCount, 0);
  });

  it("returns JSON 404 for unknown API routes", async () => {
    const res = await app.inject("/api/nope");
    assert.equal(res.statusCode, 404);
    assert.ok(res.json().error);
  });

  it("stores the watch link and the vip link of an article", async () => {
    // Tạo bài có 2 link nút bấm.
    let res = await app.inject({
      method: "POST",
      url: "/api/admin/articles",
      headers: { ...H, cookie: admin },
      payload: {
        title: "Bài có nút bấm",
        description: "Xem ngay và kênh VIP",
        watchLink: "https://anonlink.io/K8irYWpF",
        vipLink: "https://t.me/nhomchongtoico",
      },
    });
    assert.equal(res.statusCode, 200, res.body);
    const id = res.json().article.id;

    // API công khai trả về cả 2 link cho khách.
    const pub = (await app.inject(`/api/articles/${id}`)).json();
    assert.equal(pub.article.watchLink, "https://anonlink.io/K8irYWpF");
    assert.equal(pub.article.vipLink, "https://t.me/nhomchongtoico");

    // API admin cũng trả về.
    const adm = (await app.inject({ url: `/api/admin/articles/${id}`, headers: { cookie: admin } })).json();
    assert.equal(adm.article.watchLink, "https://anonlink.io/K8irYWpF");
    assert.equal(adm.article.vipLink, "https://t.me/nhomchongtoico");

    // Sửa lại link.
    res = await app.inject({
      method: "PATCH",
      url: `/api/admin/articles/${id}`,
      headers: { ...H, cookie: admin },
      payload: { watchLink: "https://anonlink.io/moi", vipLink: "" },
    });
    assert.equal(res.statusCode, 200, res.body);
    const after = (await app.inject(`/api/articles/${id}`)).json();
    assert.equal(after.article.watchLink, "https://anonlink.io/moi");
    assert.equal(after.article.vipLink, null);

    // Link không hợp lệ (không phải http/https) bị từ chối.
    res = await app.inject({
      method: "POST",
      url: "/api/admin/articles",
      headers: { ...H, cookie: admin },
      payload: { title: "Link xấu", watchLink: "javascript:alert(1)" },
    });
    assert.equal(res.statusCode, 400, res.body);

    // Bài "chỉ thành viên" không lộ link cho khách.
    res = await app.inject({
      method: "POST",
      url: "/api/admin/articles",
      headers: { ...H, cookie: admin },
      payload: {
        title: "Bài khoá",
        visibility: "members",
        watchLink: "https://anonlink.io/khoa",
        vipLink: "https://t.me/nhomchongtoico",
      },
    });
    const lockedId = res.json().article.id;
    const lockedPub = (await app.inject(`/api/articles/${lockedId}`)).json();
    assert.equal(lockedPub.article.locked, true);
    assert.equal(lockedPub.article.watchLink, null);
    assert.equal(lockedPub.article.vipLink, null);
  });

  it("caches the random article set and bypasses the cache with fresh=1", async () => {
    // Bộ bài random được cache 5 phút: hai lượt gọi liên tiếp phải cho CÙNG bộ.
    const first = (await app.inject("/api/articles/random?limit=2")).json();
    const second = (await app.inject("/api/articles/random?limit=2")).json();
    assert.equal(first.articles.length, 2);
    assert.deepEqual(
      first.articles.map((a: { id: number }) => a.id),
      second.articles.map((a: { id: number }) => a.id),
      "bộ bài random phải được cache giữa 2 lượt gọi",
    );

    // Khối random ở trang chủ dùng CHUNG cache với endpoint -> cùng bộ bài.
    const home = (await app.inject("/api/home")).json();
    assert.ok(home.articles.random.length > 0);
    assert.deepEqual(
      home.articles.random.slice(0, 2).map((a: { id: number }) => a.id),
      first.articles.map((a: { id: number }) => a.id),
      "trang chủ phải dùng cùng bộ random đã cache",
    );

    // fresh=1 bỏ qua cache -> lấy bộ mới (không nhất thiết khác, nhưng không dùng cache).
    const fresh = (await app.inject("/api/articles/random?limit=2&fresh=1")).json();
    assert.equal(fresh.articles.length, 2);
  });
});
