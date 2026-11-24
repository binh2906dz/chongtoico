/**
 * The reply keyboard of the bot.
 *
 * The admin configures the keyboard on the web. The bot reads that
 * configuration and shows the buttons under the chat box, so the user only
 * has to press one instead of typing.
 */

import type { KeyboardButton } from "@grammyjs/types";
import { KeyboardCell, KeyboardConfig } from "./client.js";
import { config } from "./config.js";

/** One row of the Telegram reply keyboard. */
export type ReplyKeyboardRow = KeyboardButton;

/** The reply keyboard that is sent to Telegram. */
export interface ReplyKeyboard {
  keyboard: ReplyKeyboardRow[][];
  resize_keyboard: true;
  one_time_keyboard: false;
  selective: false;
}

/** The settings of the keyboard, cached for a short time. */
let cache: { value: KeyboardConfig; expiresAt: number } | null = null;

/** How long the cached keyboard is used, in milliseconds. */
const CACHE_MS = 60_000;

/**
 * Read the keyboard configuration.
 *
 * The web app is asked at most once a minute, so a busy bot does not hammer
 * the API. When the web app cannot be reached the last known configuration is
 * used, and without any configuration the keyboard stays off.
 */
export async function loadKeyboard(fetchSettings: () => Promise<{ keyboard: KeyboardConfig }>): Promise<KeyboardConfig> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  try {
    const result = await fetchSettings();
    cache = { value: result.keyboard, expiresAt: Date.now() + CACHE_MS };
    return result.keyboard;
  } catch {
    return cache?.value ?? { enabled: false, prompt: "", rows: [] };
  }
}

/** Forget the cached configuration, so the next read asks the web app again. */
export function clearKeyboardCache(): void {
  cache = null;
}

/**
 * Build the Telegram reply keyboard out of the configuration.
 *
 * Returns null when the keyboard is off or when it holds no button, so the
 * bot keeps the plain chat box in that case.
 */
export function buildReplyKeyboard(cfg: KeyboardConfig | null | undefined): ReplyKeyboard | null {
  if (!cfg?.enabled) return null;
  const rows: ReplyKeyboardRow[][] = [];
  for (const row of cfg.rows ?? []) {
    const labels = (row ?? [])
      .map((cell) => (cell?.label ?? "").trim())
      .filter((label) => label.length > 0)
      .slice(0, 4);
    if (labels.length) rows.push(labels.map((label) => ({ text: label })));
  }
  if (!rows.length) return null;
  return { keyboard: rows, resize_keyboard: true, one_time_keyboard: false, selective: false };
}

/**
 * What the bot answers when the user presses a keyboard button.
 *
 * The label of the button is matched against the configuration, so the admin
 * decides what every button does. `removeKeyboard` asks Telegram to hide the
 * custom keyboard after the answer.
 */
export function answerForLabel(
  cfg: KeyboardConfig | null | undefined,
  label: string,
  openWebUrl: string,
): { text: string; removeKeyboard: boolean } | null {
  if (!cfg?.enabled) return null;
  const target = label.trim();
  for (const row of cfg.rows ?? []) {
    for (const cell of row ?? []) {
      if ((cell?.label ?? "").trim() !== target) continue;
      switch (cell.type) {
        case "text":
          return { text: cell.body ?? "", removeKeyboard: false };
        case "url":
          return {
            text: cell.body ? `${cell.body}\n${cell.url ?? ""}` : (cell.url ?? ""),
            removeKeyboard: false,
          };
        case "webapp":
        case "open_site":
          return { text: `${cell.body ?? "Mở website"}\n${openWebUrl}`, removeKeyboard: false };
        case "stats":
          return {
            text: cell.body ?? "📊 Thống kê sẽ có khi bạn mở website và đăng nhập.",
            removeKeyboard: false,
          };
        case "remove_keyboard":
          return { text: cell.body ?? "Đã ẩn bàn phím. Gõ /start để hiện lại.", removeKeyboard: true };
        default:
          return null;
      }
    }
  }
  return null;
}

/**
 * The prompt that is shown above the keyboard.
 *
 * It falls back to a short line so the user knows what to do.
 */
export function keyboardPrompt(cfg: KeyboardConfig | null | undefined): string {
  const prompt = (cfg?.prompt ?? "").trim();
  return prompt || `👇 Chọn một tùy chọn bên dưới hoặc mở ${config.webBaseUrl}`;
}
