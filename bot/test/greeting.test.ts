import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { fillGreeting, pickGreeting, clearGreetingCache, loadGreeting, planGreetingMedia, buildGreetingKeyboard } = await import(
  "../src/greeting.js"
);

const CONFIG = {
  enabled: true,
  keepButtons: true,
  items: [
    { id: "g1", text: "Chào {{name}}, mở {{link}} ngay" },
    { id: "g2", text: "Xin chào {{name}}!" },
    { id: "g3", text: "👋 Chào mừng {{name}} đến Chống Tối Cổ!" },
  ],
};

describe("The greeting of the bot", () => {
  it("picks no greeting when the admin turned it off", () => {
    assert.equal(pickGreeting({ enabled: false, keepButtons: true, items: CONFIG.items }), null);
    assert.equal(pickGreeting(null), null);
    assert.equal(pickGreeting(undefined), null);
  });

  it("picks no greeting when no text was written yet", () => {
    assert.equal(pickGreeting({ enabled: true, keepButtons: true, items: [] }), null);
    assert.equal(pickGreeting({ enabled: true, keepButtons: true, items: [{ id: "g1", text: "   " }] }), null);
  });

  it("picks one of the texts of the admin", () => {
    const picked = pickGreeting(CONFIG);
    assert.ok(picked);
    assert.ok(CONFIG.items.some((item) => item.id === picked.id));
  });

  it("replaces the name and the link", () => {
    const text = fillGreeting("Chào {{name}}, mở {{link}} ngay", "Nam", "https://example.com/?ref=bot");
    assert.equal(text, "Chào Nam, mở https://example.com/?ref=bot ngay");
  });

  it("keeps the text as it is when there is no name", () => {
    const text = fillGreeting("Chào {{name}}!", null, "https://example.com/");
    assert.equal(text, "Chào !");
  });

  it("escapes the characters that would break the HTML", () => {
    const text = fillGreeting("Chào {{name}}", "<b>Nam</b>", "https://example.com/");
    assert.equal(text, "Chào &lt;b&gt;Nam&lt;/b&gt;");
  });

  it("reads the configuration from the web app and keeps it for a minute", async () => {
    clearGreetingCache();
    let calls = 0;
    const fetchSettings = async () => {
      calls += 1;
      return { greeting: CONFIG };
    };
    const first = await loadGreeting(fetchSettings);
    assert.equal(first.enabled, true);
    assert.equal(first.items.length, 3);
    const second = await loadGreeting(fetchSettings);
    assert.equal(second.items.length, 3);
    // The second read comes from the cache.
    assert.equal(calls, 1);
    clearGreetingCache();
  });

  it("keeps the greeting off when the web app cannot be reached", async () => {
    clearGreetingCache();
    const fetchSettings = async () => {
      throw new Error("mạng chết");
    };
    const result = await loadGreeting(fetchSettings);
    assert.equal(result.enabled, false);
    assert.deepEqual(result.items, []);
    clearGreetingCache();
  });
});

describe("The media of a greeting", () => {
  it("sends the file when it is small enough and public", () => {
    const media = { kind: "image" as const, url: "https://example.com/a.webp", sizeBytes: 1000, isPublic: true };
    assert.deepEqual(planGreetingMedia(media), { sendFile: true });
  });

  it("sends no file when there is no media", () => {
    assert.deepEqual(planGreetingMedia(null), { sendFile: false });
    assert.deepEqual(planGreetingMedia(undefined), { sendFile: false });
  });

  it("never sends a file of a members-only article", () => {
    const media = { kind: "image" as const, url: "https://example.com/a.webp", sizeBytes: 1000, isPublic: false };
    const plan = planGreetingMedia(media);
    assert.equal(plan.sendFile, false);
    assert.equal(plan.reason, "media_not_public");
  });

  it("never sends a file that is too big", () => {
    const image = { kind: "image" as const, url: "https://example.com/a.webp", sizeBytes: 20 * 1024 * 1024, isPublic: true };
    assert.equal(planGreetingMedia(image).sendFile, false);
    const video = { kind: "video" as const, url: "https://example.com/v.mp4", sizeBytes: 80 * 1024 * 1024, isPublic: true };
    assert.equal(planGreetingMedia(video).sendFile, false);
  });
});

describe("The buttons of a greeting", () => {
  const STANDARD = [
    { label: "🌐 Mở Website", url: "https://example.com/" },
    { label: "🔕 Từ chối nhận", url: "https://example.com/stop" },
  ];

  it("puts the buttons of the admin before the standard ones", () => {
    const chosen = {
      id: "g1",
      text: "Chào",
      linkUrl: null,
      media: null,
      buttons: [{ label: "👑 Kênh VIP", url: "https://t.me/kenvip" }],
    };
    const rows = buildGreetingKeyboard(chosen, STANDARD, true);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], [{ text: "👑 Kênh VIP", url: "https://t.me/kenvip" }]);
    assert.deepEqual(rows[1], [{ text: "🌐 Mở Website", url: "https://example.com/" }]);
  });

  it("leaves out the standard buttons when the admin does not want them", () => {
    const chosen = {
      id: "g1",
      text: "Chào",
      linkUrl: null,
      media: null,
      buttons: [{ label: "👑 Kênh VIP", url: "https://t.me/kenvip" }],
    };
    const rows = buildGreetingKeyboard(chosen, STANDARD, false);
    assert.equal(rows.length, 1);
  });

  it("skips a button without a label or without a link", () => {
    const chosen = {
      id: "g1",
      text: "Chào",
      linkUrl: null,
      media: null,
      buttons: [
        { label: "", url: "https://example.com/" },
        { label: "Không có link", url: "" },
      ],
    };
    assert.equal(buildGreetingKeyboard(chosen, [], true).length, 0);
  });
});
