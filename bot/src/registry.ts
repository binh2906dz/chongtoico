/**
 * The registry of Telegram bots.
 *
 * The service can hold several bots at the same time. Each one has its own
 * token, its own Telegram client and its own health state. When a job has to be
 * sent, a bot is chosen by weight, and a bot that just ran into a 429 is
 * skipped for a while.
 */

import { Bot, GrammyError } from "grammy";
import { config } from "./config.js";
import { registerBot, sendHeartbeat } from "./client.js";

export type BotHealth = "live" | "ban" | "error";

export interface ManagedBot {
  id: string;
  token: string;
  client: Bot | null;
  health: BotHealth;
  /** The username reported by getMe, used to build deep links. */
  username: string | null;
  displayName: string | null;
  weight: number;
  sentCount: number;
  /** Timestamp until which the bot must not be used (429 cooldown). */
  cooldownUntil: number;
  lastError: string | null;
}

/** The registry holds every bot of this service. */
export class BotRegistry {
  private readonly bots = new Map<string, ManagedBot>();

  constructor(bots: { id: string; token: string }[]) {
    for (const entry of bots) {
      this.bots.set(entry.id, {
        id: entry.id,
        token: entry.token,
        client: null,
        health: "unknown" as BotHealth,
        username: null,
        displayName: null,
        weight: 1,
        sentCount: 0,
        cooldownUntil: 0,
        lastError: null,
      });
    }
  }

  list(): ManagedBot[] {
    return [...this.bots.values()];
  }

  get(id: string): ManagedBot | undefined {
    return this.bots.get(id);
  }

  /** The tokens of every bot, used by the initData verifier. */
  tokens(): string[] {
    return this.list().map((b) => b.token);
  }

  /** The bot a deep link should point at. */
  deepLinkBot(): ManagedBot | null {
    const live = this.list().filter((b) => b.health !== "ban" && b.health !== "error");
    const pool = live.length ? live : this.list();
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  }

  /**
   * Choose the bot that should send the next message.
   *
   * The choice is weighted, and bots in a 429 cooldown are left out.
   */
  pick(preferredId?: string | null): ManagedBot | null {
    if (preferredId) {
      const preferred = this.bots.get(preferredId);
      if (preferred && preferred.health !== "ban" && preferred.health !== "error") {
        if (preferred.cooldownUntil <= Date.now()) return preferred;
      }
    }
    const now = Date.now();
    const usable = this.list().filter((b) => b.health !== "ban" && b.health !== "error" && b.cooldownUntil <= now);
    if (!usable.length) return null;

    const total = usable.reduce((sum, b) => sum + Math.max(1, b.weight), 0);
    let pick = Math.random() * total;
    for (const bot of usable) {
      pick -= Math.max(1, bot.weight);
      if (pick <= 0) return bot;
    }
    return usable[usable.length - 1] ?? null;
  }

  /** Put a bot into the 429 cooldown. */
  markRateLimited(id: string, retryAfterSeconds: number): void {
    const bot = this.bots.get(id);
    if (!bot) return;
    const cooldownMs = Math.max(retryAfterSeconds, config.cooldownAfter429Minutes * 60) * 1000;
    bot.cooldownUntil = Date.now() + cooldownMs;
    bot.lastError = `429: chờ ${Math.round(cooldownMs / 60000)} phút`;
  }

  /** Mark a bot as banned by Telegram. */
  markBanned(id: string): void {
    const bot = this.bots.get(id);
    if (!bot) return;
    bot.health = "ban";
    bot.lastError = "Bot bị Telegram cấm (401).";
  }

  /** Mark a bot as temporarily broken. */
  markError(id: string, message: string): void {
    const bot = this.bots.get(id);
    if (!bot) return;
    bot.health = "error";
    bot.lastError = message.slice(0, 300);
    // An error only removes the bot for a short while, it is retried later.
    bot.cooldownUntil = Date.now() + 30 * 60_000;
  }

  /** Register every bot with the web app and check its health. */
  async registerAll(): Promise<void> {
    for (const bot of this.list()) {
      try {
        await this.checkHealth(bot.id);
        await registerBot(bot.id, bot.username ?? bot.id, bot.displayName ?? bot.id);
      } catch (err) {
        // The token must never appear in the log.
        this.markError(bot.id, err instanceof Error ? err.message : "Không kiểm tra được bot.");
      }
    }
  }

  /** Ask Telegram who this bot is. */
  async checkHealth(id: string): Promise<BotHealth> {
    const bot = this.bots.get(id);
    if (!bot) return "error";
    try {
      const me = await bot.client!.api.getMe();
      bot.username = me.username ?? null;
      bot.displayName = me.first_name ?? null;
      bot.health = "live";
      bot.lastError = null;
      bot.cooldownUntil = 0;
    } catch (err) {
      if (err instanceof GrammyError && err.error_code === 401) {
        this.markBanned(id);
      } else {
        this.markError(id, err instanceof Error ? err.message : "Lỗi mạng.");
      }
    }
    return bot.health;
  }

  /** Send the heartbeat of every bot to the web app. */
  async heartbeat(): Promise<void> {
    for (const bot of this.list()) {
      try {
        await sendHeartbeat(bot.id, bot.health);
      } catch {
        // The heartbeat is best effort, the service keeps running.
      }
    }
  }

  /** Report the number of people that pressed /start to the web app. */
  async reportUsers(botId: string, users: string[]): Promise<void> {
    try {
      await sendHeartbeat(botId, this.get(botId)?.health ?? "unknown", users);
    } catch {
      // Best effort.
    }
  }
}
