/**
 * Entry point of the Telegram bot service.
 *
 * The service starts three things:
 *   1. the Telegram clients of every bot,
 *   2. the internal verify server (127.0.0.1 only),
 *   3. the job loop that sends the messages the web app prepared.
 */

import { Bot, GrammyError } from "grammy";
import { config } from "./config.js";
import { fetchSettings } from "./client.js";
import { handleHelp, handleStart, handleStop, openWebUrl, type CommandContext, type CommandReply } from "./commands.js";
import { startVerifyServer } from "./internal-server.js";
import { startJobLoop } from "./jobs.js";
import { answerForLabel, buildReplyKeyboard, keyboardPrompt, loadKeyboard } from "./keyboard.js";
import { BotRegistry } from "./registry.js";

/**
 * A small logger that never prints a token.
 *
 * Telegram and HTTP errors can carry the bot token in their text, so every
 * message is scrubbed before it is written.
 */
export function log(level: "info" | "warn" | "error", message: string): void {
  const line = `[bot] ${redactSecrets(message)}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Remove the bot tokens and the shared secret from a message.
 *
 * A Telegram token looks like `123456789:AA...`; the secret is a hex string
 * that is never printed on its own.
 */
export function redactSecrets(message: string): string {
  let out = message.replace(/\b\d{5,}:[A-Za-z0-9_-]{20,}/g, "[token đã ẩn]");
  if (config.apiSecret.length >= 8) {
    out = out.split(config.apiSecret).join("[khoá đã ẩn]");
  }
  return out;
}

/** Split a command into its name and its argument. */
export function parseCommand(text: string): { name: string; argument: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const [rawName, ...rest] = trimmed.split(/\s+/);
  // The name may carry the bot name, for example `/start@my_bot`.
  const name = (rawName ?? "").replace(/^\//, "").split("@")[0]?.toLowerCase() ?? "";
  if (!name) return null;
  return { name, argument: rest.join(" ") };
}

/** Build the answer of a command, without touching Telegram. */
export async function answerCommand(
  text: string,
  ctx: CommandContext,
  registry: BotRegistry,
): Promise<CommandReply | null> {
  const parsed = parseCommand(text);
  if (!parsed) return null;
  if (parsed.name === "start") return handleStart({ ...ctx, argument: parsed.argument }, registry);
  if (parsed.name === "stop") return handleStop(ctx);
  return handleHelp(ctx);
}

export async function main(): Promise<void> {
  if (!config.apiSecret) {
    log("error", "Thiếu BOT_API_SECRET — dừng lại.");
    process.exit(1);
  }
  if (!config.botTokens.length) {
    log("error", "Thiếu TELEGRAM_BOT_TOKENS — dừng lại.");
    process.exit(1);
  }

  const registry = new BotRegistry(config.botTokens);

  // 1. The Telegram clients.
  for (const managed of registry.list()) {
    const client = new Bot(managed.token);
    client.catch((err) => {
      if (err instanceof GrammyError && err.error_code === 429) {
        registry.markRateLimited(managed.id, err.parameters?.retry_after ?? 60);
        return;
      }
      log("warn", `Lỗi Telegram ở bot ${managed.id}: ${err.message}`);
    });
    managed.client = client;
    client.on("message", async (ctx) => {
      const text = ctx.message?.text ?? "";
      const commandCtx: CommandContext = {
        telegramId: ctx.from?.id ?? 0,
        firstName: ctx.from?.first_name ?? null,
        username: ctx.from?.username ?? null,
        botId: managed.id,
        botUsername: managed.username,
      };

      // A button of the reply keyboard is not a command, so it is answered
      // with the text the admin prepared for it.
      if (!text.trim().startsWith("/")) {
        const cfg = await loadKeyboard(fetchSettings);
        const answer = answerForLabel(cfg, text, openWebUrl(commandCtx, "keyboard"));
        if (answer !== null) {
          try {
            await ctx.reply(answer.text, {
              parse_mode: "HTML",
              // The admin can add a button that hides the custom keyboard.
              reply_markup: answer.removeKeyboard ? { remove_keyboard: true } : undefined,
            });
          } catch (err) {
            log("warn", `Không gửi được câu trả lời: ${err instanceof Error ? err.message : "lỗi"}`);
          }
          return;
        }
      }

      const reply = await answerCommand(text, commandCtx, registry);
      if (!reply) return;

      const rows = reply.buttons.map((b) => [{ text: b.label, url: b.url }]);
      // The reply keyboard is shown under the chat box when the admin turned
      // it on; the inline buttons stay as they are.
      const keyboardCfg = await loadKeyboard(fetchSettings);
      const replyKeyboard = buildReplyKeyboard(keyboardCfg);
      const prompt = keyboardCfg?.enabled ? `\n\n${keyboardPrompt(keyboardCfg)}` : "";
      try {
        await ctx.reply(`${reply.text}${prompt}`, {
          parse_mode: "HTML",
          reply_markup: replyKeyboard
            ? replyKeyboard
            : rows.length
              ? { inline_keyboard: rows }
              : undefined,
        });
      } catch (err) {
        log("warn", `Không gửi được câu trả lời: ${err instanceof Error ? err.message : "lỗi"}`);
      }
    });
    if (config.enableTelegram) {
      // `bot.start()` bắt đầu long polling: đây là cách DUY NHẤT bot nhận
      // được message (kể cả /start). `bot.init()` chỉ gọi getMe để kiểm tra
      // token, KHÔNG mở kết nối nhận update — thiếu nó thì bot im lặng.
      // `start()` tự gọi `init()` bên trong nên không cần gọi thêm.
      //
      // KHÔNG được `await`: promise của start() chỉ resolve khi polling dừng,
      // nên await sẽ chặn cả vòng lặp và các bot sau đó không bao giờ chạy.
      // Vì vậy khởi động không chặn, lỗi bắt bằng `.catch`.
      void client
        .start({
          // `onStart` chỉ chạy sau khi long polling đã bắt đầu thật sự.
          onStart: (info) => {
            log("info", `Bot ${managed.id} đã sẵn sàng (@${info.username}).`);
          },
          drop_pending_updates: false,
        })
        .catch((err) => {
          log("warn", `Long polling của bot ${managed.id} dừng: ${err instanceof Error ? err.message : "lỗi"}`);
        });
    }
  }

  // 2. The internal verify server.
  const server = await startVerifyServer({
    tokens: () => registry.tokens(),
    checkBot: async (botId) => {
      const managed = registry.get(botId);
      if (!managed) return null;
      const status = await registry.checkHealth(botId);
      return { status, error: managed.lastError };
    },
    applyBot: async (action, botId, token) => {
      if (action === "remove") {
        registry.remove(botId);
        log("info", `Đã gỡ bot ${botId} theo yêu cầu từ web.`);
        return true;
      }
      if (!token) return false;
      registry.add(botId, token);
      log("info", `Đã thêm bot ${botId} theo yêu cầu từ web.`);
      // Open the Telegram connection right away so the bot can work at once.
      await registry.checkHealth(botId).catch(() => undefined);
      return true;
    },
  });
  log("info", `Dịch vụ nội bộ đang lắng nghe trên ${config.internalHost}:${config.internalPort}.`);

  // 3. Registration, heartbeat and the job loop.
  await registry.registerAll();
  const heartbeatTimer = setInterval(() => {
    void registry.heartbeat();
  }, config.heartbeatIntervalMs);
  heartbeatTimer.unref?.();

  const stopLoop = startJobLoop(registry);

  const shutdown = async (signal: string) => {
    log("info", `Nhận ${signal}, đang tắt dịch vụ.`);
    clearInterval(heartbeatTimer);
    stopLoop();
    for (const managed of registry.list()) {
      try {
        await managed.client?.stop();
      } catch {
        // Ignore.
      }
    }
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
