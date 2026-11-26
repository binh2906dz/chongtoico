/**
 * The commands of the bot.
 *
 * Only three commands exist: /start, /stop and /help. There is no custom
 * keyboard and no scripted flow — the bot only shows fixed buttons.
 */

import { config } from "./config.js";
import { fetchUserState, reportLink, reportOptOut, reportStart } from "./client.js";
import type { GreetingConfig, GreetingMedia } from "./client.js";
import { fillGreeting, pickGreeting } from "./greeting.js";
import type { BotRegistry } from "./registry.js";

export interface CommandContext {
  telegramId: number;
  firstName: string | null;
  username: string | null;
  /** The payload that follows the command, for example a link code. */
  argument?: string;
  /** The bot that received the command. */
  botId: string;
  /** The username of the bot that received the command. */
  botUsername: string | null;
}

export interface CommandReply {
  text: string;
  /** The inline keyboard buttons, as a flat list of label/url pairs. */
  buttons: { label: string; url: string }[];
  /** The media sent together with the text, when the admin chose one. */
  media?: GreetingMedia | null;
}

const OPEN_WEB_LABEL = "🌐 Mở Website";
const NOTIFY_LABEL = "🔔 Nhận thông báo";
const UNNOTIFY_LABEL = "🔕 Từ chối nhận";

/** The deep link that opens the website with the tracking parameters. */
export function openWebUrl(ctx: CommandContext, src: string): string {
  const base = config.webBaseUrl;
  const params = new URLSearchParams({ ref: "bot", tid: String(ctx.telegramId), src });
  return `${base}/?${params.toString()}`;
}

/** Handle /start, with or without a link code. */
export async function handleStart(
  ctx: CommandContext,
  registry: BotRegistry,
  greeting?: GreetingConfig | null,
): Promise<CommandReply> {
  const code = ctx.argument?.trim();

  if (code) {
    try {
      const result = await reportLink(code, ctx.telegramId, ctx.botId, {
        username: ctx.username ?? undefined,
        firstName: ctx.firstName ?? undefined,
      });
      if (result.linked) {
        return {
          text: `✅ Đã liên kết thành công! Tài khoản ${result.username ?? "của bạn"} đã gắn với Telegram.`,
          buttons: [{ label: OPEN_WEB_LABEL, url: openWebUrl(ctx, "start") }],
        };
      }
      return {
        text: "⚠️ Mã liên kết không hợp lệ hoặc đã hết hạn. Hãy tạo mã mới trên website rồi thử lại.",
        buttons: [{ label: OPEN_WEB_LABEL, url: openWebUrl(ctx, "start") }],
      };
    } catch {
      return {
        text: "⚠️ Không liên kết được. Hãy tạo mã mới trên website rồi thử lại.",
        buttons: [{ label: OPEN_WEB_LABEL, url: openWebUrl(ctx, "start") }],
      };
    }
  }

  // No code: remember the person and show the three fixed buttons.
  try {
    await reportStart(ctx.telegramId, ctx.botId, {
      username: ctx.username ?? undefined,
      firstName: ctx.firstName ?? undefined,
    });
  } catch {
    // The web app may be down; the bot still answers.
  }

  let notifyEnabled = true;
  let linked = false;
  try {
    const state = await fetchUserState(ctx.telegramId);
    notifyEnabled = state.notifyEnabled;
    linked = state.linked;
  } catch {
    // Keep the defaults.
  }

  const name = ctx.firstName ? ` ${ctx.firstName}` : "";
  const buttons: { label: string; url: string }[] = [
    { label: OPEN_WEB_LABEL, url: openWebUrl(ctx, "start") },
  ];
  if (notifyEnabled) {
    buttons.push({ label: NOTIFY_LABEL, url: openWebUrl(ctx, "notify_on") });
    buttons.push({ label: UNNOTIFY_LABEL, url: openWebUrl(ctx, "stop") });
  }

  // The admin may write their own greeting; one of the texts is picked at
  // random so the same person does not always get the same wording.
  const chosen = pickGreeting(greeting);
  if (chosen) {
    // The link of the greeting wins over the default one; the placeholder
    // {{link}} always points at it.
    const link = chosen.linkUrl?.trim() || openWebUrl(ctx, "start");
    const text = fillGreeting(chosen.text, ctx.firstName, link);
    // The buttons of the admin come first; the standard ones follow when the
    // admin wants to keep them.
    const allButtons = [...chosen.buttons, ...(greeting?.keepButtons === false ? [] : buttons)];
    return {
      text,
      buttons: allButtons.filter((button) => button.label && button.url),
      media: chosen.media ?? null,
    };
  }

  const body = linked
    ? `👋 Chào mừng${name}! Bạn đã liên kết với tài khoản web rồi.`
    : `👋 Chào mừng${name} đến Chống Tối Cổ!\n\nBấm nút bên dưới để mở website.`;
  return { text: body, buttons };
}

/** Handle /stop. */
export async function handleStop(ctx: CommandContext): Promise<CommandReply> {
  try {
    await reportOptOut(ctx.telegramId, ctx.botId);
  } catch {
    // The web app may be down; the answer is still sent.
  }
  return {
    text: "✅ Đã từ chối nhắn. Gõ /start lại bất cứ lúc nào để nhận lại.",
    buttons: [{ label: OPEN_WEB_LABEL, url: openWebUrl(ctx, "stop") }],
  };
}

/** Handle /help. */
export function handleHelp(ctx: CommandContext): CommandReply {
  return {
    text: [
      "ℹ️ Cách dùng:",
      "• /start — mở website",
      "• /stop — không nhận tin nhắn nữa",
      "• /help — xem hướng dẫn này",
    ].join("\n"),
    buttons: [{ label: OPEN_WEB_LABEL, url: openWebUrl(ctx, "help") }],
  };
}

/** Pick the bot a deep link should point at. */
export function deepLinkTarget(registry: BotRegistry): { username: string | null } {
  const bot = registry.deepLinkBot();
  return { username: bot?.username ?? null };
}
