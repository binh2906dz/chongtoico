import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { answerForLabel, buildReplyKeyboard, keyboardPrompt, clearKeyboardCache } = await import("../src/keyboard.js");

const CONFIG = {
  enabled: true,
  prompt: "👇 Chọn một tùy chọn",
  rows: [
    [
      { label: "Mở website", type: "open_site" as const },
      { label: "Xem bài mới", type: "text" as const },
    ],
    [{ label: "Ẩn bàn phím", type: "remove_keyboard" as const }],
  ],
};

describe("The reply keyboard of the bot", () => {
  it("builds a keyboard out of the configuration", () => {
    const keyboard = buildReplyKeyboard(CONFIG);
    assert.ok(keyboard);
    assert.equal(keyboard.keyboard.length, 2);
    assert.equal(keyboard.keyboard[0].length, 2);
    assert.equal(keyboard.resize_keyboard, true);
    assert.equal(keyboard.one_time_keyboard, false);
  });

  it("builds no keyboard when the admin turned it off", () => {
    assert.equal(buildReplyKeyboard({ enabled: false, prompt: "", rows: [] }), null);
    assert.equal(buildReplyKeyboard(null), null);
    assert.equal(buildReplyKeyboard(undefined), null);
  });

  it("builds no keyboard when every row is empty", () => {
    assert.equal(buildReplyKeyboard({ enabled: true, prompt: "", rows: [[], []] }), null);
  });

  it("answers a text button with the text of the admin", () => {
    const answer = answerForLabel(CONFIG, "Xem bài mới", "https://example.com/?ref=bot");
    assert.ok(answer);
    assert.equal(answer.text, "");
    assert.equal(answer.removeKeyboard, false);
  });

  it("answers a link button with the website link", () => {
    const answer = answerForLabel(CONFIG, "Mở website", "https://example.com/?ref=bot");
    assert.ok(answer);
    assert.ok(answer.text.includes("https://example.com/?ref=bot"));
  });

  it("asks Telegram to hide the keyboard for the remove button", () => {
    const answer = answerForLabel(CONFIG, "Ẩn bàn phím", "https://example.com/");
    assert.ok(answer);
    assert.equal(answer.removeKeyboard, true);
  });

  it("ignores a text that is not a button", () => {
    assert.equal(answerForLabel(CONFIG, "chào bạn", "https://example.com/"), null);
  });

  it("ignores the buttons when the keyboard is off", () => {
    assert.equal(
      answerForLabel({ enabled: false, prompt: "", rows: CONFIG.rows }, "Mở website", "https://example.com/"),
      null,
    );
  });

  it("uses a fallback prompt when the admin left it empty", () => {
    assert.equal(keyboardPrompt({ enabled: true, prompt: "   ", rows: [] }).length > 0, true);
    assert.equal(keyboardPrompt(CONFIG), "👇 Chọn một tùy chọn");
  });

  it("clears the cached configuration", () => {
    clearKeyboardCache();
    // Nothing to assert beyond the fact that it does not throw.
    assert.ok(true);
  });
});
