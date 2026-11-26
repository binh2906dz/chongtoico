import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * The job loop of the bot.
 *
 * A campaign of 61.000 ids produces 61.000 outcomes. Reporting them one by
 * one means one round trip per job, and that is what slows the send down the
 * most (B112). The outcomes therefore travel together.
 */
const client = await import("../src/client.js");

describe("The outcomes of the bot", () => {
  it("sends many outcomes in one request", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: { body?: string } = {}) => {
      calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : undefined });
      return new Response(JSON.stringify({ ok: true, done: 3 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const res = await client.reportResults([
        { jobId: 1, status: "sent" },
        { jobId: 2, status: "failed", error: "chat not found" },
        { jobId: 3, status: "blocked", botId: "bot-a" },
      ]);
      assert.equal(res.done, 3);
      assert.equal(calls.length, 1, "Cả lô kết quả phải đi trong một request.");
      assert.match(calls[0].url, /\/api\/bot\/results$/);
      const body = calls[0].body as { results: { jobId: number; status: string }[] };
      assert.equal(body.results.length, 3);
      assert.equal(body.results[0].jobId, 1);
      assert.equal(body.results[1].status, "failed");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("still reports a single outcome on its own", async () => {
    const calls: { url: string }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push({ url: String(url) });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      await client.reportResult(7, "sent", { botId: "bot-a" });
      assert.equal(calls.length, 1);
      assert.match(calls[0].url, /\/api\/bot\/result$/);
    } finally {
      globalThis.fetch = original;
    }
  });
});
