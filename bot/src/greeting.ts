/**
 * The greeting the bot sends when somebody presses /start.
 *
 * The admin writes the texts on the web; the bot picks one of them at random
 * so the same person does not always get the same wording. The texts may use
 * HTML and the placeholders `{{name}}` and `{{link}}`.
 */

import { GreetingConfig, GreetingItem } from "./client.js";

/** The placeholders the admin may use in a greeting. */
export const GREETING_PLACEHOLDERS = [
  { token: "{{name}}", hint: "Tên người dùng (có thể để trống)" },
  { token: "{{link}}", hint: "Đường dẫn mở website kèm theo" },
] as const;

/** The greeting settings, cached for a short time. */
let cache: { value: GreetingConfig; expiresAt: number } | null = null;

/** How long the cached configuration is used, in milliseconds. */
const CACHE_MS = 60_000;

/** The configuration used when the web app cannot be reached. */
const EMPTY: GreetingConfig = { enabled: false, keepButtons: true, items: [] };

/**
 * Read the greeting configuration.
 *
 * The web app is asked at most once a minute. When it cannot be reached the
 * last known configuration is used, and without any configuration the greeting
 * stays off.
 */
export async function loadGreeting(
  fetchSettings: () => Promise<{ greeting: GreetingConfig }>,
): Promise<GreetingConfig> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  try {
    const result = await fetchSettings();
    cache = { value: result.greeting ?? EMPTY, expiresAt: Date.now() + CACHE_MS };
    return cache.value;
  } catch {
    return cache?.value ?? EMPTY;
  }
}

/** Forget the cached configuration, so the next read asks the web app again. */
export function clearGreetingCache(): void {
  cache = null;
}

/**
 * Pick one greeting at random.
 *
 * Returns null when the greeting is off or when no text was written yet, so
 * the bot keeps its own default answer in that case.
 */
export function pickGreeting(cfg: GreetingConfig | null | undefined): GreetingItem | null {
  if (!cfg?.enabled) return null;
  const items = (cfg.items ?? []).filter((item) => (item?.text ?? "").trim().length > 0);
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

/**
 * Replace the placeholders of a greeting.
 *
 * The name may be empty; the link is escaped so it never breaks the HTML.
 */
export function fillGreeting(text: string, name: string | null, link: string): string {
  const safeName = (name ?? "").trim();
  return text.split("{{name}}").join(escapeHtml(safeName)).split("{{link}}").join(escapeHtml(link));
}

/** Escape the characters that would break the HTML of the message. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
