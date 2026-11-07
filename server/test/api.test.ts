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

  it("enforces staff-only categories", async () => {
    const cats = (await app.inject("/api/forum/categories")).json().categories;
    const announce = cats.find((c: { slug: string }) => c.slug === "thong-bao");
    const res = await app.inject({
      method: "POST",
      url: "/api/forum/threads",
      headers: { ...H, cookie: alice.cookie },
      payload: { categoryId: announce.id, title: "Không được", content: "x" },
    });
    assert.equal(res.statusCode, 403);
  });

  it("creates threads, replies, likes and keeps counters", async () => {
    const cats = (await app.inject("/api/forum/categories")).json().categories;
    const chat = cats.find((c: { slug: string }) => c.slug === "tan-gau");
    let res = await app.inject({
      method: "POST",
      url: "/api/forum/threads",
      headers: { ...H, cookie: alice.cookie },
      payload: { categoryId: chat.id, title: "Chào cả nhà", content: "Bài đầu tiên" },
    });
    assert.equal(res.statusCode, 200, res.body);
    threadId = res.json().thread.id;

    res = await app.inject({
      method: "POST",
      url: `/api/forum/threads/${threadId}/posts`,
      headers: { ...H, cookie: bob.cookie },
      payload: { content: "Chào bạn" },
    });
    assert.equal(res.statusCode, 200, res.body);
    replyId = res.json().post.id;

    const page = (await app.inject(`/api/forum/threads/${threadId}`)).json();
    assert.equal(page.posts.length, 2);
    assert.equal(page.thread.replyCount, 1);
    assert.equal(page.thread.lastPoster.username, "Bob_1");
    firstPostId = page.posts[0].id;

    res = await app.inject({ method: "POST", url: `/api/forum/posts/${firstPostId}/like`, headers: { ...H, cookie: bob.cookie } });
    assert.deepEqual(res.json(), { liked: true, likeCount: 1 });
    res = await app.inject({ method: "POST", url: `/api/forum/posts/${firstPostId}/like`, headers: { ...H, cookie: alice.cookie } });
    assert.equal(res.statusCode, 400);

    const liked = (await app.inject({ url: `/api/forum/threads/${threadId}`, headers: { cookie: bob.cookie } })).json();
    assert.equal(liked.posts[0].likedByMe, true);

    const profile = (await app.inject("/api/members/alice")).json().user;
    assert.equal(profile.threadCount, 1);
    assert.equal(profile.postCount, 1);
    assert.equal(profile.likeCount, 1);
  });

  it("serves feeds, home, rankings and search", async () => {
    for (const type of ["latest", "updated", "hot", "trending"]) {
      const feed = (await app.inject(`/api/forum/feed?type=${type}`)).json();
      assert.equal(feed.threads[0].id, threadId, type);
    }
    const home = (await app.inject("/api/home")).json();
    assert.equal(home.stats.threads, 1);
    assert.equal(home.stats.posts, 2);
    assert.equal(home.rankings.topLiked[0].username, "alice");
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
    const res = await app.inject({ method: "DELETE", url: `/api/forum/posts/${replyId}`, headers: { ...H, cookie: bob.cookie } });
    assert.equal(res.statusCode, 200, res.body);
    const page = (await app.inject(`/api/forum/threads/${threadId}`)).json();
    assert.equal(page.thread.replyCount, 0);
    assert.equal(page.thread.lastPoster.username, "alice");
    assert.equal((await app.inject("/api/members/Bob_1")).json().user.postCount, 0);
  });

  it("chat messages", async () => {
    const chans = (await app.inject("/api/chat/channels")).json().channels;
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
    const msgs = (await app.inject(`/api/chat/channels/${general.id}/messages`)).json().messages;
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].author.username, "alice");
  });

  it("albums: create, upload, members-only lock, media serving", async () => {
    let res = await app.inject({
      method: "POST",
      url: "/api/albums",
      headers: { ...H, cookie: alice.cookie },
      payload: { title: "Không phải staff" },
    });
    assert.equal(res.statusCode, 403);
    res = await app.inject({
      method: "POST",
      url: "/api/albums",
      headers: { ...H, cookie: admin },
      payload: { title: "Phong cảnh", visibility: "members", isHot: true },
    });
    assert.equal(res.statusCode, 200, res.body);
    const albumId = res.json().album.id;

    const mp = multipart([
      { name: "a.png", data: await png(3000, 2000) },
      { name: "b.png", data: await png(400, 300) },
    ]);
    res = await app.inject({
      method: "POST",
      url: `/api/albums/${albumId}/images`,
      headers: { ...H, cookie: admin, "content-type": mp.contentType },
      payload: mp.payload,
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().added.length, 2);

    const bad = multipart([{ name: "x.png", data: Buffer.from("not an image") }]);
    res = await app.inject({
      method: "POST",
      url: `/api/albums/${albumId}/images`,
      headers: { ...H, cookie: admin, "content-type": bad.contentType },
      payload: bad.payload,
    });
    assert.equal(res.statusCode, 400);

    const guest = (await app.inject(`/api/albums/${albumId}`)).json();
    assert.equal(guest.album.locked, true);
    assert.equal(guest.images.length, 0);
    const member = (await app.inject({ url: `/api/albums/${albumId}`, headers: { cookie: bob.cookie } })).json();
    assert.equal(member.images.length, 2);
    assert.equal(member.images[0].width, 2000);
    assert.ok(member.album.coverUrl);

    const url = member.images[0].url;
    assert.equal((await app.inject(url)).statusCode, 403);
    const img = await app.inject({ url, headers: { cookie: bob.cookie } });
    assert.equal(img.statusCode, 200);
    assert.equal(img.headers["content-type"], "image/webp");
    assert.equal((await app.inject({ url: member.images[0].thumbUrl, headers: { cookie: bob.cookie } })).statusCode, 200);
    assert.equal((await app.inject("/media/a/../../etc.webp")).statusCode, 404);

    const list = (await app.inject("/api/albums?hot=1")).json();
    assert.equal(list.albums.length, 1);
    assert.equal(list.albums[0].imageCount, 2);
    assert.equal(list.albums[0].coverUrl, null);

    res = await app.inject({
      method: "DELETE",
      url: `/api/albums/${albumId}/images/${member.images[0].id}`,
      headers: { ...H, cookie: admin },
    });
    assert.equal(res.statusCode, 200);
    const after = (await app.inject({ url: `/api/albums/${albumId}`, headers: { cookie: bob.cookie } })).json();
    assert.equal(after.album.imageCount, 1);
    assert.equal(after.album.coverImageId, after.images[0].id);
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
      headers: { ...H, cookie: alice.cookie, "content-type": mp.contentType },
      payload: mp.payload,
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.match(res.json().markup, /^\[img:[a-f0-9]{32}\]$/);
    assert.equal((await app.inject(res.json().url)).statusCode, 200);
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

  it("ban blocks posting and shows in rankings; unban restores", async () => {
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
    const ranks = (await app.inject("/api/members/rankings")).json();
    assert.equal(ranks.banned[0].username, "Bob_1");
    assert.equal(ranks.banned[0].banReason, "Spam");

    await app.inject({ method: "POST", url: `/api/admin/users/${bob.user.id}/unban`, headers: { ...H, cookie: admin } });
    assert.equal((await app.inject("/api/members/rankings")).json().banned.length, 0);
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
    const profile = (await app.inject("/api/members/alice")).json().user;
    assert.equal(profile.postCount, 1);
    assert.equal(profile.likeCount, 1);
  });

  it("deleting the first post deletes the thread and fixes counters", async () => {
    const res = await app.inject({ method: "DELETE", url: `/api/forum/posts/${firstPostId}`, headers: { ...H, cookie: alice.cookie } });
    assert.equal(res.json().threadDeleted, true);
    assert.equal((await app.inject(`/api/forum/threads/${threadId}`)).statusCode, 404);
    const profile = (await app.inject("/api/members/alice")).json().user;
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
});
